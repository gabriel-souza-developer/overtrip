import { Prisma } from '@prisma/client';
import { Router } from 'express';
import cors from 'cors';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { PUBLIC_STATUSES, publicTripsService } from '../services/publicTrips.js';
import { publicSiteService, isPubliclyVisibleOrganization } from '../services/publicSite.js';
import { settingsService } from '../services/settingsService.js';
import {
  MEDIA_FILE_PATTERN, mediaDirectory, mediaPublicSrc, mediaStorageKeyFromFilename,
  MediaFileMissingError, MediaSymlinkRejectedError, readMediaFileForServing,
} from '../services/mediaStorage.js';
import { serveVideoFromDisk } from '../services/serveVideo.js';
import { loadLegacyMediaAllowlist } from '../services/mediaLegacyAllowlist.js';
import { publicFaqService } from '../services/publicFaq.js';

const router = Router();

// Rota pública do site: sem login, CORS aberto e sem credenciais, só leitura.
router.use(cors({ origin: '*', methods: ['GET'], credentials: false }));

router.get('/trips', async (_req, res, next) => {
  try {
    const trips = await publicTripsService.list();
    res.set('Cache-Control', 'no-cache');
    res.json(trips);
  } catch (error) {
    next(error);
  }
});

router.get('/faq', async (_req, res, next) => {
  try {
    const faq = await publicFaqService.get();
    res.set('Cache-Control', 'no-store');
    res.json({ entries: faq.entries });
  } catch (error) {
    next(error);
  }
});

router.get('/gallery', async (_req, res, next) => {
  try {
    const entries = await publicSiteService.gallery();
    res.set('Cache-Control', 'no-cache');
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

// Só destinos revisados e com coordenadas.
router.get('/destinations', async (_req, res, next) => {
  try {
    const destinations = await publicSiteService.destinations();
    res.set('Cache-Control', 'no-cache');
    res.json(destinations);
  } catch (error) {
    next(error);
  }
});

// Imagens enviadas pelo painel. O nome contém 128 bits aleatórios, mas isso
// não é mais o único controle: a titularidade decide se o arquivo é servido.
const MEDIA_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' };
router.get('/media/:file', async (req, res, next) => {
  try {
    const { file } = req.params;
    if (!MEDIA_FILE_PATTERN.test(file)) {
      res.set('Cache-Control', 'no-store').status(404).json({ error: 'Imagem não encontrada' });
      return;
    }
    const notFound = () => { res.set('Cache-Control', 'no-store').status(404).json({ error: 'Imagem não encontrada' }); };

    // Uma única consulta decide tudo: existe, está publicado (não pendente:
    // um envio em andamento, ou interrompido por queda/SIGKILL antes de
    // publicar, nunca é servido) e a organização está autorizada. Nunca duas
    // consultas separadas (existência, depois autorização) — poderiam
    // discordar se algo mudasse entre elas (publicação concorrente do mesmo
    // storageKey, desativação da organização no meio do caminho). Toda
    // variante (sufixo -w640/-w960/-w1280) segue o mesmo registro do arquivo
    // principal, pelo mesmo storageKey.
    const storageKey = mediaStorageKeyFromFilename(file);
    if (file.endsWith('.mp4')) {
      // Upload completion and trip publication are independent. Recheck both
      // in the same snapshot on every request, including byte ranges.
      const organizations = config.publicSiteOrganizationIds;
      const organizationVisible = organizations.length
        ? Prisma.sql`(a.organizationId IS NULL OR (a.organizationId IN (${Prisma.join(organizations)}) AND o.status = 'ACTIVE'))`
        : Prisma.sql`a.organizationId IS NULL`;
      const visible = await prisma.$queryRaw<{ id: string }[]>`
        SELECT a.id FROM MediaAsset a
        LEFT JOIN Organization o ON o.id = a.organizationId
        WHERE a.storageKey = ${storageKey} AND a.path = ${mediaPublicSrc(file)}
          AND a.mimeType = 'video/mp4' AND a.publishedAt IS NOT NULL AND ${organizationVisible}
          AND EXISTS (
            SELECT 1 FROM Trip t,
              json_each(CASE WHEN json_valid(t.media) THEN
                CASE WHEN json_type(t.media) = 'array' THEN t.media ELSE '[]' END ELSE '[]' END) m
            WHERE t.organizationId IS a.organizationId AND t.status IN (${Prisma.join(PUBLIC_STATUSES)})
              AND CASE WHEN m.type = 'object' THEN json_extract(m.value, '$.src') END = a.path
          )
        LIMIT 1`;
      if (!visible.length) { notFound(); return; }
      await serveVideoFromDisk(res, await mediaDirectory(), file, 'no-cache');
      return;
    }
    const asset = await prisma.mediaAsset.findFirst({
      where: { storageKey },
      select: { publishedAt: true, organizationId: true, organization: { select: { status: true } } },
    });

    const directory = await mediaDirectory();
    let buffer: Buffer;
    if (asset) {
      const visible = asset.publishedAt !== null && isPubliclyVisibleOrganization(asset.organizationId, asset.organization?.status, config.publicSiteOrganizationIds);
      if (!visible) { notFound(); return; }
      try {
        // Nunca segue link simbólico: ler para servir e checar que é um
        // arquivo normal são a mesma operação atômica (sem janela entre
        // checar e enviar em que o caminho possa ser trocado por um link).
        ({ buffer } = await readMediaFileForServing(directory, file));
      } catch (error) {
        if (error instanceof MediaSymlinkRejectedError || error instanceof MediaFileMissingError) { notFound(); return; }
        throw error;
      }
    } else {
      // Sem registro nenhum: só servido se o NOME EXATO deste arquivo (nunca
      // só o storageKey — isso liberaria qualquer variante ou extensão nunca
      // revisada) constar na allowlist explícita de mídia legada, e só depois
      // de reconferir agora o conteúdo real contra o tamanho/hash que foram
      // revisados — a allowlist nunca é "confie e sirva", sempre "confie e
      // prove de novo". Nunca por padrão.
      const entry = (await loadLegacyMediaAllowlist()).get(file);
      if (!entry) { notFound(); return; }
      try {
        const read = await readMediaFileForServing(directory, file);
        if (read.sizeBytes !== entry.sizeBytes || read.sha256 !== entry.sha256) { notFound(); return; }
        buffer = read.buffer;
      } catch (error) {
        if (error instanceof MediaSymlinkRejectedError || error instanceof MediaFileMissingError) { notFound(); return; }
        throw error;
      }
    }

    res.set({
      'Content-Type': MEDIA_TYPES[file.slice(file.lastIndexOf('.') + 1)],
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // Revalidação sempre, nunca cache imutável de longo prazo: a
      // organização de um arquivo pode ser desativada ou desautorizada
      // depois de servido, e um cache compartilhado (CDN, proxy) nunca
      // deve continuar servindo-o sem consultar a origem a cada uso. Isto
      // não afeta uma cópia que um cache já guardou enquanto a resposta
      // ainda dizia "immutable, 1 ano" antes desta mudança — ver
      // deploy/ORACLE_STATUS.md.
      'Cache-Control': 'no-cache',
    }).send(buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/settings/whatsapp', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-cache');
    res.json({ defaultWhatsapp: await settingsService.getDefaultWhatsapp() });
  } catch (error) {
    next(error);
  }
});

export default router;
