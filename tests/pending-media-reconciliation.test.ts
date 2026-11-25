import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeExpectedFiles } from '../src/services/mediaStorage';
import { findReconciliationCandidates, MIN_OLDER_THAN_MS, reconcileOne, reconcilePendingMedia } from '../scripts/lib/pendingMediaReconciliation';

// Auditoria independente (três rodadas): (1) a mera existência dos arquivos
// esperados nunca prova que a gravação terminou antes de uma queda (pode
// estar truncada) — corrigido com fileIntegrity. (2) reconcileOne fazia
// unlink entre um findFirst e um deleteMany condicional: nessa janela, o
// upload podia terminar de gravar e publicar, e a reconciliação apagaria um
// arquivo já publicado — corrigido eliminando a remoção automática de
// pendente incompleto. (3) mesmo a PUBLICAÇÃO automática de um pendente
// íntegro corria com o próprio upload: um envio lento (>15 min, disco/rede
// lenta) pode estar ativo quando a reconciliação decide publicar; se a
// própria chamada de publicação do upload falhar DEPOIS (ex.: erro de rede
// só na resposta, já com a escrita efetivada), o rollback do upload
// assumia ser o único escritor e apagava arquivo e registro sem reconferir
// publishedAt, destruindo o ativo que a reconciliação tinha acabado de
// publicar. Corrigido eliminando TODA mutação desta ferramenta — ela é
// puramente diagnóstica, mesmo para um pendente totalmente íntegro — e
// reconferindo publishedAt antes de qualquer limpeza no rollback do upload
// (ver tests/media-http.test.ts para o teste desse lado).

const directory = mkdtempSync(join(tmpdir(), 'overtrip-media-reconcile-'));
const databasePath = join(directory, 'test.db');
const databaseUrl = `file:${databasePath}`;
const uploadsDir = join(directory, 'uploads');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const HOUR = 60 * 60000;
const OLD = () => new Date(Date.now() - 2 * HOUR);

const fakeImage = (mainContent: string, variantWidths: readonly number[] = [640, 960, 1280]) => ({
  ext: 'jpg' as const, mimeType: 'image/jpeg' as const, width: 10, height: 10,
  main: Buffer.from(mainContent),
  variants: variantWidths.map((width) => ({ width, buffer: Buffer.from(`${mainContent}-v${width}`) })),
});

/** Grava os arquivos exatamente como fileIntegrity descreve: simula um upload que terminou com sucesso antes de uma queda ao publicar. */
function writeMatchingFiles(storageKey: string, mainContent = 'payload') {
  const image = fakeImage(mainContent);
  const integrity = describeExpectedFiles(image, storageKey);
  for (const entry of integrity) writeFileSync(join(uploadsDir, entry.name), entry.name.endsWith('.jpg') ? image.main : image.variants.find((v) => entry.name.includes(`w${v.width}`))!.buffer);
  return JSON.stringify(integrity);
}

const pendingAsset = (storageKey: string, createdAt: Date, fileIntegrity: string | null) => ({
  storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
  width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: storageKey.padEnd(64, '0'), createdById: 'user-a',
  publishedAt: null, createdAt, fileIntegrity,
});

beforeAll(() => {
  execFileSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
  mkdirSync(uploadsDir, { recursive: true });
  return db.user.create({ data: { id: 'user-a', email: 'fixture@example.test', passwordHash: 'fixture', role: 'admin' } });
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe('reconciliação de MediaAsset pendente: puramente diagnóstica, nunca publica, nunca remove nem altera nada', () => {
  it('pendente antigo cujos arquivos batem exatamente (tamanho e hash) com fileIntegrity é reportado como pronto para publicar, mas NUNCA publicado por esta ferramenta', async () => {
    const key = '10000000000000000000000000000000'.slice(0, 32);
    const integrity = writeMatchingFiles(key);
    await db.mediaAsset.create({ data: pendingAsset(key, OLD(), integrity) });

    const report = await reconcilePendingMedia(db, uploadsDir, HOUR);
    expect(report.readyToPublish).toEqual([key]);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { storageKey: key } })).publishedAt).toBeNull();

    // Rodar de novo (como um "--apply" faria antes) continua sem publicar nada.
    await reconcilePendingMedia(db, uploadsDir, HOUR);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { storageKey: key } })).publishedAt).toBeNull();

    await db.mediaAsset.delete({ where: { storageKey: key } });
  });

  it('NUNCA publica um arquivo truncado/alterado, mesmo que todos os nomes esperados existam — e NUNCA remove automaticamente: só reporta para revisão manual', async () => {
    const key = '20000000000000000000000000000000'.slice(0, 32);
    const integrity = writeMatchingFiles(key, 'conteudo-original');
    await db.mediaAsset.create({ data: pendingAsset(key, OLD(), integrity) });
    // Queda no meio da escrita: o arquivo principal existe, mas truncado/diferente do que fileIntegrity descreve.
    writeFileSync(join(uploadsDir, `${key}.jpg`), 'tru');

    const report = await reconcilePendingMedia(db, uploadsDir, HOUR);
    expect(report.readyToPublish).toEqual([]);
    expect(report.needsReview).toContain(key);
    // Nada foi tocado: nem o registro, nem o arquivo truncado, nem as variantes completas.
    expect(await db.mediaAsset.findUnique({ where: { storageKey: key } })).not.toBeNull();
    expect(existsSync(join(uploadsDir, `${key}.jpg`))).toBe(true);
    expect(existsSync(join(uploadsDir, `${key}-w640.webp`))).toBe(true);

    await db.mediaAsset.delete({ where: { storageKey: key } });
  });

  it('pendente sem fileIntegrity (anterior ao campo, ou corrompido) é reportado como não verificável, nunca publicado nem removido', async () => {
    const key = '30000000000000000000000000000000'.slice(0, 32);
    writeMatchingFiles(key);
    await db.mediaAsset.create({ data: pendingAsset(key, OLD(), null) });

    const report = await reconcilePendingMedia(db, uploadsDir, HOUR);
    expect(report.readyToPublish).toEqual([]);
    expect(report.needsReview).toEqual([]);
    expect(report.skippedUnverifiable).toContain(key);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { storageKey: key } })).publishedAt).toBeNull();
  });

  it('link simbólico no lugar de uma variante é reportado como suspeito, nunca publicado nem removido', async () => {
    const key = '40000000000000000000000000000000'.slice(0, 32);
    const integrity = writeMatchingFiles(key);
    await db.mediaAsset.create({ data: pendingAsset(key, OLD(), integrity) });
    const target = join(directory, 'fora-da-pasta.webp');
    writeFileSync(target, 'nao-e-o-arquivo-esperado');
    rmSync(join(uploadsDir, `${key}-w640.webp`));
    symlinkSync(target, join(uploadsDir, `${key}-w640.webp`));

    const report = await reconcilePendingMedia(db, uploadsDir, HOUR);
    expect(report.readyToPublish).toEqual([]);
    expect(report.needsReview).toEqual([]);
    expect(report.skippedSuspicious).toContain(key);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { storageKey: key } })).publishedAt).toBeNull();
  });

  it('nunca inclui um pendente mais recente que o limite (envio genuinamente em andamento)', async () => {
    const key = '50000000000000000000000000000000'.slice(0, 32);
    await db.mediaAsset.create({ data: pendingAsset(key, new Date(), null) });
    const report = await reconcilePendingMedia(db, uploadsDir, HOUR);
    expect([...report.readyToPublish, ...report.needsReview, ...report.skippedUnverifiable, ...report.skippedSuspicious]).not.toContain(key);
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { storageKey: key } })).publishedAt).toBeNull();
  });

  it('impõe um limite mínimo conservador mesmo que olderThanMs peça menos (nunca mais sensível do que MIN_OLDER_THAN_MS)', async () => {
    const key = '60000000000000000000000000000000'.slice(0, 32);
    const integrity = writeMatchingFiles(key);
    const barelyOld = new Date(Date.now() - (MIN_OLDER_THAN_MS - 60000)); // mais novo que o mínimo
    await db.mediaAsset.create({ data: pendingAsset(key, barelyOld, integrity) });
    const report = await reconcilePendingMedia(db, uploadsDir, 60000); // pediu 1 minuto, bem abaixo do mínimo
    expect(report.readyToPublish).not.toContain(key);
    await db.mediaAsset.delete({ where: { storageKey: key } });
  });

  it('corrida upload/reconciliador: um pendente "pronto para publicar" (envio lento, >15 min, mas ainda ativo) nunca é publicado nem tem arquivo tocado por esta ferramenta, mesmo chamando reconcileOne diretamente', async () => {
    const key = '70000000000000000000000000000000'.slice(0, 32);
    const integrity = writeMatchingFiles(key);
    await db.mediaAsset.create({ data: pendingAsset(key, OLD(), integrity) });

    const candidate = (await findReconciliationCandidates(db, HOUR)).find((c) => c.storageKey === key)!;
    expect(candidate.storageKey).toBe(key);

    const decision = await reconcileOne(uploadsDir, candidate);
    expect(decision.action).toBe('ready-to-publish');

    // Mesmo tendo classificado como pronto para publicar, nada foi escrito:
    // o próprio upload (ainda "ativo" do ponto de vista desta chamada) seria
    // livre para terminar e publicar por conta própria sem nenhuma corrida.
    const after = await db.mediaAsset.findUniqueOrThrow({ where: { storageKey: key } });
    expect(after.publishedAt).toBeNull();
    for (const entry of JSON.parse(integrity)) expect(existsSync(join(uploadsDir, entry.name))).toBe(true);

    await db.mediaAsset.delete({ where: { storageKey: key } });
  });

  it('CLI é sempre diagnóstico (nunca publica nem remove), mesmo passando --apply (aceito, sem efeito, para não quebrar automação antiga)', () => {
    const key = 'a0000000000000000000000000000000'.slice(0, 32);
    const integrity = writeMatchingFiles(key);
    return db.mediaAsset.create({ data: pendingAsset(key, OLD(), integrity) }).then(() => {
      const tooLow = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/reconcile-pending-media.ts'), '--database', databaseUrl, '--uploads-dir', uploadsDir, '--older-than-minutes', '1'], { encoding: 'utf8', env: process.env });
      expect(tooLow.status).not.toBe(0);
      expect(tooLow.stderr).toMatch(/pelo menos/);

      const simulate = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/reconcile-pending-media.ts'), '--database', databaseUrl, '--uploads-dir', uploadsDir, '--older-than-minutes', '30'], { encoding: 'utf8', env: process.env });
      expect(simulate.status).toBe(0);
      const simulated = JSON.parse(simulate.stdout);
      expect(simulated.mode).toBe('diagnostic');
      expect(simulated.readyToPublish).toContain(key);

      const withApply = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/reconcile-pending-media.ts'), '--database', databaseUrl, '--uploads-dir', uploadsDir, '--older-than-minutes', '30', '--apply'], { encoding: 'utf8', env: process.env });
      expect(withApply.status).toBe(0);
      const applied = JSON.parse(withApply.stdout);
      expect(applied.mode).toBe('diagnostic');
      expect(applied.note).toMatch(/ignorado/);
      expect(applied.readyToPublish).toContain(key);

      return db.mediaAsset.findUniqueOrThrow({ where: { storageKey: key } }).then((row) => {
        expect(row.publishedAt).toBeNull();
      });
    });
  });
});
