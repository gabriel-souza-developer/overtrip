import type { Prisma, PrismaClient } from '@prisma/client';
import type { Response } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { MEDIA_FILE_PATTERN, mediaDirectory, mediaStorageKeyFromFilename, readMediaFileForServing } from './mediaStorage.js';
import { MEDIA_PUBLIC_PREFIX } from '../validators/imageSrc.js';

export interface OwnedImageInput { src: string; alt: string }
type MediaAssetClient = Pick<PrismaClient | Prisma.TransactionClient, 'mediaAsset'>;

function filenameFromPublicSrc(src: string): string | null {
  if (!src.startsWith(MEDIA_PUBLIC_PREFIX)) return null;
  const filename = src.slice(MEDIA_PUBLIC_PREFIX.length);
  return MEDIA_FILE_PATTERN.test(filename) ? filename : null;
}

/**
 * Valida, no momento de salvar, que toda foto indicada já foi enviada por
 * ESTA empresa e está publicada — nunca aceita um `src` arbitrário do
 * cliente, nem reaproveita mídia de outra organização ou do acervo legado.
 * Usada por destinos visitados, galeria e viagens, as únicas rotas de
 * empresa que aceitam fotos. Devolve o JSON já no formato canônico
 * (`/api/public/media/<arquivo>`) gravado nessas tabelas desde a operação
 * legada — a mesma convenção que a leitura (abaixo) espera. Genérica sobre
 * campos extras (ex.: `focus` da capa de viagem): só o `src` é validado.
 */
export async function assertOwnedImages<T extends { src: string }>(client: MediaAssetClient, organizationId: string, images: T[]): Promise<string> {
  if (images.length === 0) return '[]';
  const filenames = images.map((image) => {
    const filename = filenameFromPublicSrc(image.src);
    if (!filename) throw AppError.badRequest('Foto inválida. Envie a foto novamente.');
    return filename;
  });
  const keys = [...new Set(filenames.map((filename) => mediaStorageKeyFromFilename(filename)))];
  const owned = await client.mediaAsset.findMany({ where: { storageKey: { in: keys }, organizationId, publishedAt: { not: null } }, select: { storageKey: true } });
  const ownedKeys = new Set(owned.map((asset) => asset.storageKey));
  if (keys.some((key) => !ownedKeys.has(key))) {
    throw AppError.badRequest('Alguma foto não foi encontrada ou não pertence a esta empresa. Envie a foto novamente.');
  }
  return JSON.stringify(images);
}

export interface ParsedOwnedImage { filename: string; key: string; alt: string; focus?: string }

/** Lê o JSON gravado (`/api/public/media/<arquivo>`) sem ainda confirmar titularidade — ver filterOwnedImages. */
export function parseStoredImages(value: string | null | undefined, limit = 10): ParsedOwnedImage[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, limit).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const { src, alt, focus } = item as { src?: unknown; alt?: unknown; focus?: unknown };
      if (typeof src !== 'string') return [];
      const filename = filenameFromPublicSrc(src);
      if (!filename) return [];
      return [{
        filename, key: mediaStorageKeyFromFilename(filename), alt: typeof alt === 'string' ? alt.slice(0, 500) : '',
        ...(typeof focus === 'string' && focus ? { focus: focus.slice(0, 80) } : {}),
      }];
    });
  } catch { return []; }
}

/**
 * A partir de listas JÁ PARSEADAS (uma por registro), confirma titularidade
 * em uma única consulta e devolve, para cada registro, só as imagens que a
 * própria empresa publicou — nunca a imagem de outra empresa, nem uma
 * referência órfã (arquivo apagado, registro nunca publicado).
 *
 * Devolve DUAS URLs por foto, nunca uma só:
 * - `src`: o caminho canônico (`/api/public/media/<arquivo>`) gravado no
 *   banco. O formulário deve reenviar exatamente este valor ao salvar sem
 *   trocar a foto — é o único formato que `assertOwnedImages` aceita. Nunca
 *   trocar por `previewSrc` aqui: romperia o round-trip leitura→edição→
 *   escrita (a tela carrega pelo GET, edita outro campo e reenvia a mesma
 *   foto, que `assertOwnedImages` rejeitaria por não reconhecer o prefixo).
 * - `previewSrc`: a rota de leitura autenticada por empresa (`rewriteSrc`,
 *   ver serveOwnedMediaFile), que funciona mesmo fora de
 *   PUBLIC_SITE_ORGANIZATION_IDS — é o que o painel deve usar em `<img src>`.
 */
export async function filterOwnedImages(
  client: MediaAssetClient, organizationId: string, parsedPerRow: ParsedOwnedImage[][], rewriteSrc: (filename: string) => string,
): Promise<Array<Array<{ src: string; previewSrc: string; alt: string; focus?: string }>>> {
  const keys = [...new Set(parsedPerRow.flatMap((row) => row.map((image) => image.key)))];
  const owned = keys.length ? await client.mediaAsset.findMany({ where: { storageKey: { in: keys }, organizationId, publishedAt: { not: null } }, select: { storageKey: true } }) : [];
  const ownedKeys = new Set(owned.map((asset) => asset.storageKey));
  return parsedPerRow.map((row) => row.filter((image) => ownedKeys.has(image.key)).map((image) => ({
    src: `${MEDIA_PUBLIC_PREFIX}${image.filename}`, previewSrc: rewriteSrc(image.filename), alt: image.alt, ...(image.focus ? { focus: image.focus } : {}),
  })));
}

const MEDIA_CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Serve um arquivo de mídia já enviado por ESTA empresa — mesmo padrão de
 * `/api/public/media/:file`, mas sem depender de PUBLIC_SITE_ORGANIZATION_IDS:
 * uma empresa fora da vitrine pública ainda precisa ver, no próprio painel,
 * as fotos que ela mesma enviou. Nunca serve um registro de outra empresa
 * ou ainda não publicado (ver MediaAsset.publishedAt).
 */
export async function serveOwnedMediaFile(res: Response, client: MediaAssetClient, organizationId: string, filename: string): Promise<void> {
  if (!MEDIA_FILE_PATTERN.test(filename)) throw AppError.notFound('Imagem não encontrada');
  const asset = await client.mediaAsset.findFirst({ where: { storageKey: mediaStorageKeyFromFilename(filename), organizationId, publishedAt: { not: null } }, select: { id: true } });
  if (!asset) throw AppError.notFound('Imagem não encontrada');
  try {
    const { buffer } = await readMediaFileForServing(await mediaDirectory(), filename);
    const contentType = MEDIA_CONTENT_TYPES[filename.slice(filename.lastIndexOf('.') + 1)];
    res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }).send(buffer);
  } catch {
    throw AppError.notFound('Imagem não encontrada');
  }
}
