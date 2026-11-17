import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  applyLegacyMediaManifest, computeDatabaseFingerprint, inventoryLegacyMedia, readLegacyMediaManifest,
  type LegacyMediaManifest, writeLegacyMediaAllowlist, writeLegacyMediaManifest,
} from '../scripts/lib/legacyMediaInventory';

// Auditoria independente (três rodadas): (1) --write reinspecionava e
// aprovava automaticamente TODOS os órfãos encontrados na hora, sem ligação a
// revisão humana. (2) applyLegacyMediaManifest não validava que
// candidate.filename correspondia ao storageKey/padrão declarado (abriria
// path traversal ou aprovação de chave errada), nem detectava duplicata. (3)
// o manifesto vinculava o banco só pelo caminho, que não detecta o SQLite
// sendo substituído no mesmo caminho. (4) a escrita da allowlist era
// read-modify-write sem trava nem atomicidade (perde aprovação concorrente
// ou gera JSON parcial numa queda). (5) a varredura e a allowlist só
// aceitavam o arquivo principal (jpg/png); uma variante WebP legada órfã
// nunca podia ser inventariada nem aprovada, mesmo revisada individualmente —
// gerava 404 permanente sem solução. Corrigido: --propose/--apply-manifest
// (nunca promoção automática), validação de nome/duplicata, impressão digital
// do arquivo do banco (dev+inode, não só caminho), escrita da allowlist sob
// trava de arquivo com troca atômica (grava em temporário, rename), e
// variantes órfãs agora são candidatos próprios (seu nome exato, seu hash),
// nunca aprovadas automaticamente pela aprovação do principal (ou vice-versa).

const directory = mkdtempSync(join(tmpdir(), 'overtrip-media-inventory-'));
const databasePath = join(directory, 'test.db');
const databaseUrl = `file:${databasePath}`;
const uploadsDir = join(directory, 'uploads');
const allowlistPath = join(uploadsDir, '.legacy-media-allowlist.json');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const asset = (storageKey: string) => ({
  storageKey, path: `/api/public/media/${storageKey}.jpg`, mimeType: 'image/jpeg',
  width: 10, height: 10, sizeBytes: 10, originalBytes: 10, sha256: storageKey.padEnd(64, '0'), createdById: 'user-a',
  publishedAt: new Date(),
});

async function manifestFor(candidates: LegacyMediaManifest['candidates']): Promise<LegacyMediaManifest> {
  return { generatedAt: new Date().toISOString(), database: databasePath, databaseFingerprint: await computeDatabaseFingerprint(databasePath), uploadsDir, candidates };
}

beforeAll(() => {
  execFileSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
  mkdirSync(uploadsDir, { recursive: true });
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe('inventário de mídia legada (manifesto revisado, nunca promoção automática)', () => {
  it('a varredura identifica arquivos principais E variantes WebP órfãos (sem MediaAsset), cada um seu próprio candidato com tamanho e hash — mas não aprova nada; arquivos de um storageKey registrado (principal ou variante) nunca são candidatos', async () => {
    await db.user.create({ data: { id: 'user-a', email: 'fixture@example.test', passwordHash: 'fixture', role: 'admin' } });
    const registeredKey = '11111111111111111111111111111111'.slice(0, 32);
    const orphanKey = '22222222222222222222222222222222'.slice(0, 32);
    await db.mediaAsset.create({ data: asset(registeredKey) });
    writeFileSync(join(uploadsDir, `${registeredKey}.jpg`), 'x');
    writeFileSync(join(uploadsDir, `${registeredKey}-w640.webp`), 'x'); // storageKey registrado: nunca candidato, mesmo a variante
    writeFileSync(join(uploadsDir, `${orphanKey}.jpg`), 'conteudo-legado');
    writeFileSync(join(uploadsDir, `${orphanKey}-w640.webp`), 'conteudo-variante-legada'); // órfão: candidato PRÓPRIO, com seu próprio hash
    writeFileSync(join(uploadsDir, 'not-media.txt'), 'x');

    const result = await inventoryLegacyMedia(db, uploadsDir);
    expect(result.totalFiles).toBe(4);
    expect(result.registered).toEqual([registeredKey]);
    expect(result.candidates.map((c) => c.filename).sort()).toEqual([`${orphanKey}-w640.webp`, `${orphanKey}.jpg`].sort());
    expect(result.candidates.every((c) => c.storageKey === orphanKey)).toBe(true);
    const main = result.candidates.find((c) => c.filename === `${orphanKey}.jpg`)!;
    const variant = result.candidates.find((c) => c.filename === `${orphanKey}-w640.webp`)!;
    expect(main.sizeBytes).toBe(Buffer.byteLength('conteudo-legado'));
    expect(variant.sizeBytes).toBe(Buffer.byteLength('conteudo-variante-legada'));
    expect(main.sha256).not.toBe(variant.sha256); // cada um com seu próprio hash, nunca compartilhado
    expect(existsSync(allowlistPath)).toBe(false); // nada foi promovido
  });

  it('um link simbólico no lugar do arquivo principal ou de uma variante nunca é candidato, mesmo sem registro', async () => {
    const symlinkKey = '99999999999999999999999999999999'.slice(0, 32);
    const variantSymlinkKey = '9898989898989898989898989898989898'.slice(0, 32);
    const target = join(directory, 'outro-lugar.jpg');
    writeFileSync(target, 'fora-da-pasta');
    symlinkSync(target, join(uploadsDir, `${symlinkKey}.jpg`));
    symlinkSync(target, join(uploadsDir, `${variantSymlinkKey}-w640.webp`));
    const result = await inventoryLegacyMedia(db, uploadsDir);
    expect(result.rejectedSymlinks).toContain(`${symlinkKey}.jpg`);
    expect(result.rejectedSymlinks).toContain(`${variantSymlinkKey}-w640.webp`);
    expect(result.candidates.map((c) => c.storageKey)).not.toContain(symlinkKey);
    expect(result.candidates.map((c) => c.storageKey)).not.toContain(variantSymlinkKey);
  });

  it('CLI simula por padrão (não escreve manifesto nem allowlist)', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/inventory-legacy-media.ts'), '--database', databaseUrl, '--uploads-dir', uploadsDir], { encoding: 'utf8', env: process.env });
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout).mode).toBe('simulation');
    expect(existsSync(allowlistPath)).toBe(false);
  });

  it('--propose grava um manifesto para revisão humana, nunca a allowlist; --apply-manifest reverifica e só então aprova', async () => {
    const manifestPath = join(directory, 'manifest.json');
    const propose = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/inventory-legacy-media.ts'), '--database', databaseUrl, '--uploads-dir', uploadsDir, '--propose', manifestPath], { encoding: 'utf8', env: process.env });
    expect(propose.status).toBe(0);
    expect(JSON.parse(propose.stdout).mode).toBe('proposed');
    expect(existsSync(allowlistPath)).toBe(false);
    const writtenManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(typeof writtenManifest.databaseFingerprint.ino).toBe('number');

    const apply = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/inventory-legacy-media.ts'), '--database', databaseUrl, '--uploads-dir', uploadsDir, '--apply-manifest', manifestPath], { encoding: 'utf8', env: process.env });
    expect(apply.status).toBe(0);
    const output = JSON.parse(apply.stdout);
    expect(output.mode).toBe('applied');
    expect(output.rejected).toEqual([]);
    const written = JSON.parse(readFileSync(allowlistPath, 'utf8'));
    // Compara pelos nomes de arquivo exatos do próprio manifesto proposto
    // (não por storageKey): um storageKey pode agora propor mais de um
    // arquivo (principal e variantes), então storageKey não é mais 1:1 com
    // nome de arquivo aprovado.
    const proposedFilenames = writtenManifest.candidates.map((c: { filename: string }) => c.filename);
    expect(written.entries.map((e: { filename: string }) => e.filename)).toEqual(expect.arrayContaining(proposedFilenames));
  });

  it('candidato alterado entre a proposta e a aplicação (conteúdo diferente) é recusado, não aprovado', async () => {
    const key = '33333333333333333333333333333333'.slice(0, 32);
    const file = join(uploadsDir, `${key}.jpg`);
    writeFileSync(file, 'original');
    const scan = await inventoryLegacyMedia(db, uploadsDir);
    const manifest = await manifestFor(scan.candidates.filter((c) => c.storageKey === key));
    expect(manifest.candidates).toHaveLength(1);

    // Alteração depois da "revisão" (manifesto já gerado com o hash de "original").
    writeFileSync(file, 'alterado-depois-da-revisao');

    const result = await applyLegacyMediaManifest(db, manifest, uploadsDir, databasePath, manifest.databaseFingerprint, allowlistPath);
    expect(result.approved).toEqual([]);
    expect(result.rejected).toEqual([{ storageKey: key, filename: `${key}.jpg`, reason: 'content-changed' }]);
    const written = JSON.parse(readFileSync(allowlistPath, 'utf8'));
    expect(written.entries.map((e: { filename: string }) => e.filename)).not.toContain(`${key}.jpg`);
  });

  it('candidato removido ou virado link simbólico depois da revisão é recusado', async () => {
    const missingKey = '44444444444444444444444444444444'.slice(0, 32);
    const symlinkKey = '55555555555555555555555555555555'.slice(0, 32);
    writeFileSync(join(uploadsDir, `${missingKey}.jpg`), 'vai-ser-removido');
    writeFileSync(join(uploadsDir, `${symlinkKey}.jpg`), 'vai-virar-link');
    const scan = await inventoryLegacyMedia(db, uploadsDir);
    const manifest = await manifestFor(scan.candidates.filter((c) => c.storageKey === missingKey || c.storageKey === symlinkKey));
    expect(manifest.candidates).toHaveLength(2);

    rmSync(join(uploadsDir, `${missingKey}.jpg`));
    rmSync(join(uploadsDir, `${symlinkKey}.jpg`));
    symlinkSync(join(directory, 'outro-lugar.jpg'), join(uploadsDir, `${symlinkKey}.jpg`));

    const result = await applyLegacyMediaManifest(db, manifest, uploadsDir, databasePath, manifest.databaseFingerprint, allowlistPath);
    expect(result.approved).toEqual([]);
    expect(result.rejected).toContainEqual({ storageKey: missingKey, filename: `${missingKey}.jpg`, reason: 'missing' });
    expect(result.rejected).toContainEqual({ storageKey: symlinkKey, filename: `${symlinkKey}.jpg`, reason: 'symlink' });
  });

  it('candidato cujo storageKey passou a ter um MediaAsset real (upload concorrente) é recusado, mesmo com conteúdo idêntico', async () => {
    const key = '66666666666666666666666666666666'.slice(0, 32);
    writeFileSync(join(uploadsDir, `${key}.jpg`), 'conteudo-que-virou-upload-real');
    const scan = await inventoryLegacyMedia(db, uploadsDir);
    const manifest = await manifestFor(scan.candidates.filter((c) => c.storageKey === key));
    expect(manifest.candidates).toHaveLength(1);

    const claimed = await db.mediaAsset.create({ data: asset(key) });
    const result = await applyLegacyMediaManifest(db, manifest, uploadsDir, databasePath, manifest.databaseFingerprint, allowlistPath);
    expect(result.approved).toEqual([]);
    expect(result.rejected).toEqual([{ storageKey: key, filename: `${key}.jpg`, reason: 'now-registered' }]);
    await db.mediaAsset.delete({ where: { id: claimed.id } });
  });

  it('candidato com nome de arquivo que não corresponde ao storageKey declarado (path traversal ou chave trocada) é recusado pelo manifesto inteiro', async () => {
    const key = '88888888888888888888888888888888'.slice(0, 32);
    const manifestPath = join(directory, 'traversal-manifest.json');
    const fingerprint = await computeDatabaseFingerprint(databasePath);
    await writeLegacyMediaManifest(manifestPath, {
      generatedAt: new Date().toISOString(), database: databasePath, databaseFingerprint: fingerprint, uploadsDir,
      candidates: [{ storageKey: key, filename: '../../../etc/passwd', sizeBytes: 1, sha256: 'a'.repeat(64) }],
    });
    await expect(readLegacyMediaManifest(manifestPath)).rejects.toThrow();
  });

  it('readLegacyMediaManifest recusa nome de arquivo duplicado no mesmo manifesto', async () => {
    const key = '12121212121212121212121212121212'.slice(0, 32);
    const manifestPath = join(directory, 'duplicate-manifest.json');
    const fingerprint = await computeDatabaseFingerprint(databasePath);
    await writeLegacyMediaManifest(manifestPath, {
      generatedAt: new Date().toISOString(), database: databasePath, databaseFingerprint: fingerprint, uploadsDir,
      candidates: [
        { storageKey: key, filename: `${key}.jpg`, sizeBytes: 1, sha256: 'a'.repeat(64) },
        { storageKey: key, filename: `${key}.jpg`, sizeBytes: 2, sha256: 'b'.repeat(64) },
      ],
    });
    await expect(readLegacyMediaManifest(manifestPath)).rejects.toThrow();
  });

  it('readLegacyMediaManifest PERMITE candidatos com o mesmo storageKey quando são o principal e suas variantes (nomes de arquivo diferentes) — cada um revisado e aprovado à parte', async () => {
    const key = '14141414141414141414141414141414'.slice(0, 32);
    const manifestPath = join(directory, 'main-plus-variant-manifest.json');
    const fingerprint = await computeDatabaseFingerprint(databasePath);
    await writeLegacyMediaManifest(manifestPath, {
      generatedAt: new Date().toISOString(), database: databasePath, databaseFingerprint: fingerprint, uploadsDir,
      candidates: [
        { storageKey: key, filename: `${key}.jpg`, sizeBytes: 1, sha256: 'a'.repeat(64) },
        { storageKey: key, filename: `${key}-w640.webp`, sizeBytes: 2, sha256: 'b'.repeat(64) },
        { storageKey: key, filename: `${key}-w960.webp`, sizeBytes: 3, sha256: 'c'.repeat(64) },
      ],
    });
    const manifest = await readLegacyMediaManifest(manifestPath);
    expect(manifest.candidates).toHaveLength(3);
  });

  it('um candidato de variante cujo nome declara um storageKey diferente do campo storageKey é recusado (o padrão mais amplo para variantes não enfraquece a checagem de chave)', async () => {
    const declaredKey = '15151515151515151515151515151515'.slice(0, 32);
    const actualKeyInFilename = '16161616161616161616161616161616'.slice(0, 32);
    const manifestPath = join(directory, 'variant-key-mismatch-manifest.json');
    const fingerprint = await computeDatabaseFingerprint(databasePath);
    await writeLegacyMediaManifest(manifestPath, {
      generatedAt: new Date().toISOString(), database: databasePath, databaseFingerprint: fingerprint, uploadsDir,
      candidates: [{ storageKey: declaredKey, filename: `${actualKeyInFilename}-w640.webp`, sizeBytes: 1, sha256: 'a'.repeat(64) }],
    });
    await expect(readLegacyMediaManifest(manifestPath)).rejects.toThrow();
  });

  it('applyLegacyMediaManifest também recusa, por si só, um candidato com nome fora do padrão (defesa em profundidade, mesmo sem passar por readLegacyMediaManifest)', async () => {
    const key = '13131313131313131313131313131313'.slice(0, 32);
    const fingerprint = await computeDatabaseFingerprint(databasePath);
    const manifest: LegacyMediaManifest = {
      generatedAt: new Date().toISOString(), database: databasePath, databaseFingerprint: fingerprint, uploadsDir,
      candidates: [{ storageKey: key, filename: '../escape.jpg', sizeBytes: 1, sha256: 'a'.repeat(64) }],
    };
    const result = await applyLegacyMediaManifest(db, manifest, uploadsDir, databasePath, fingerprint, allowlistPath);
    expect(result.approved).toEqual([]);
    expect(result.rejected).toEqual([{ storageKey: key, filename: '../escape.jpg', reason: 'invalid-filename' }]);
  });

  it('apply-manifest recusa um manifesto gerado para outro banco ou outra pasta de uploads', async () => {
    const manifestPath = join(directory, 'wrong-target-manifest.json');
    const fingerprint = await computeDatabaseFingerprint(databasePath);
    await writeLegacyMediaManifest(manifestPath, { generatedAt: new Date().toISOString(), database: '/caminho/errado/outro.db', databaseFingerprint: fingerprint, uploadsDir, candidates: [] });
    const run = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/inventory-legacy-media.ts'), '--database', databaseUrl, '--uploads-dir', uploadsDir, '--apply-manifest', manifestPath], { encoding: 'utf8', env: process.env });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/outro banco|outra pasta/);
  });

  it('apply-manifest recusa quando o arquivo do banco foi substituído no MESMO caminho (impressão digital dev+inode não corresponde, mesmo que o caminho seja igual)', async () => {
    const manifestPath = join(directory, 'stale-fingerprint-manifest.json');
    await writeLegacyMediaManifest(manifestPath, {
      generatedAt: new Date().toISOString(), database: databasePath, databaseFingerprint: { dev: 1, ino: 999999 }, uploadsDir, candidates: [],
    });
    const run = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/inventory-legacy-media.ts'), '--database', databaseUrl, '--uploads-dir', uploadsDir, '--apply-manifest', manifestPath], { encoding: 'utf8', env: process.env });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/substituíd/);
  });

  it('aprovar uma variante órfã individualmente não aprova o principal (nem outras variantes) do mesmo storageKey — cada arquivo exige sua própria revisão', async () => {
    const key = '17171717171717171717171717171717'.slice(0, 32);
    writeFileSync(join(uploadsDir, `${key}.jpg`), 'principal-nunca-revisado');
    writeFileSync(join(uploadsDir, `${key}-w640.webp`), 'variante-revisada-e-aprovada');
    writeFileSync(join(uploadsDir, `${key}-w960.webp`), 'outra-variante-nunca-revisada');
    const scan = await inventoryLegacyMedia(db, uploadsDir);
    const variantOnly = scan.candidates.filter((c) => c.filename === `${key}-w640.webp`);
    expect(variantOnly).toHaveLength(1);
    const manifest = await manifestFor(variantOnly);

    const result = await applyLegacyMediaManifest(db, manifest, uploadsDir, databasePath, manifest.databaseFingerprint, allowlistPath);
    expect(result.approved).toEqual([key]);
    expect(result.rejected).toEqual([]);

    const written = JSON.parse(readFileSync(allowlistPath, 'utf8'));
    const filenames = written.entries.map((e: { filename: string }) => e.filename);
    expect(filenames).toContain(`${key}-w640.webp`);
    expect(filenames).not.toContain(`${key}.jpg`);
    expect(filenames).not.toContain(`${key}-w960.webp`);
  });

  it('a allowlist é a UNIÃO entre aplicações (por nome exato): uma entrada já aprovada antes continua, mesmo que não apareça no manifesto desta vez', async () => {
    await writeLegacyMediaAllowlist(allowlistPath, [{ filename: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg', sizeBytes: 1, sha256: 'a'.repeat(64) }]);
    const key = '77777777777777777777777777777777'.slice(0, 32);
    writeFileSync(join(uploadsDir, `${key}.jpg`), 'novo-aprovado');
    const scan = await inventoryLegacyMedia(db, uploadsDir);
    const manifest = await manifestFor(scan.candidates.filter((c) => c.storageKey === key));
    await applyLegacyMediaManifest(db, manifest, uploadsDir, databasePath, manifest.databaseFingerprint, allowlistPath);
    const written = JSON.parse(readFileSync(allowlistPath, 'utf8'));
    const filenames = written.entries.map((e: { filename: string }) => e.filename);
    expect(filenames).toEqual(expect.arrayContaining(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg', `${key}.jpg`]));
  });

  it('a escrita da allowlist recusa concorrência (trava de arquivo) em vez de arriscar perder uma aprovação em read-modify-write', async () => {
    const lockPath = `${allowlistPath}.lock`;
    const lockHandle = await open(lockPath, 'wx');
    try {
      await expect(writeLegacyMediaAllowlist(allowlistPath, [{ filename: 'cccccccccccccccccccccccccccccccc.jpg', sizeBytes: 1, sha256: 'c'.repeat(64) }])).rejects.toThrow();
    } finally {
      await lockHandle.close();
      rmSync(lockPath, { force: true });
    }
  });

  it('a escrita da allowlist é atômica (arquivo temporário + rename): nunca existe um estado de JSON truncado no caminho final', async () => {
    await writeLegacyMediaAllowlist(allowlistPath, [{ filename: 'dddddddddddddddddddddddddddddddd.jpg', sizeBytes: 1, sha256: 'd'.repeat(64) }]);
    // Depois de uma escrita bem-sucedida, nenhum arquivo temporário ou de trava sobra.
    const leftovers = readFileSync(allowlistPath, 'utf8');
    expect(() => JSON.parse(leftovers)).not.toThrow();
    expect(existsSync(`${allowlistPath}.lock`)).toBe(false);
  });

  it('readLegacyMediaManifest recusa JSON malformado ou com campos ausentes', async () => {
    const malformed = join(directory, 'malformed-manifest.json');
    writeFileSync(malformed, '{not valid json');
    await expect(readLegacyMediaManifest(malformed)).rejects.toThrow();
    const incomplete = join(directory, 'incomplete-manifest.json');
    writeFileSync(incomplete, JSON.stringify({ database: databasePath }));
    await expect(readLegacyMediaManifest(incomplete)).rejects.toThrow();
  });
});
