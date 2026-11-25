import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  ALLOWLIST_FILENAME, applyLegacyMediaManifest, computeDatabaseFingerprint, InventoryError, inventoryLegacyMedia,
  readLegacyMediaManifest, writeLegacyMediaManifest,
} from './lib/legacyMediaInventory.js';

function parseArgs(args: string[]) {
  let database = ''; let uploadsDir = ''; let propose = ''; let applyManifest = '';
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--database' && !database && args[index + 1]) database = args[++index];
    else if (arg === '--uploads-dir' && !uploadsDir && args[index + 1]) uploadsDir = args[++index];
    else if (arg === '--propose' && !propose && args[index + 1]) propose = args[++index];
    else if (arg === '--apply-manifest' && !applyManifest && args[index + 1]) applyManifest = args[++index];
    else throw new InventoryError('Uso: --database file:/caminho/absoluto --uploads-dir /caminho/absoluto [--propose /caminho/manifesto.json | --apply-manifest /caminho/manifesto.json]');
  }
  if (propose && applyManifest) throw new InventoryError('Use --propose ou --apply-manifest, nunca os dois na mesma execução.');
  return { database, uploadsDir, propose, applyManifest };
}

function resolveTargets(database: string, uploadsDir: string) {
  const path = database.startsWith('file:') ? database.slice(5) : '';
  if (!path || !isAbsolute(path) || path.includes('?') || path.includes('#')) {
    throw new InventoryError('Informe --database file:/caminho/absoluto e --uploads-dir /caminho/absoluto.');
  }
  if (!uploadsDir || !isAbsolute(uploadsDir)) throw new InventoryError('Informe --uploads-dir com um caminho absoluto existente.');
  const actualDatabase = realpathSync(path);
  if (!statSync(actualDatabase).isFile()) throw new InventoryError('O banco indicado deve ser um arquivo SQLite existente.');
  if (/[?#%]/.test(actualDatabase)) throw new InventoryError('O caminho real do banco não pode conter caracteres especiais de URI.');
  const actualUploadsDir = realpathSync(uploadsDir);
  if (!statSync(actualUploadsDir).isDirectory()) throw new InventoryError('--uploads-dir deve ser um diretório existente.');
  return { actualDatabase, actualUploadsDir };
}

async function main() {
  const { database, uploadsDir, propose, applyManifest } = parseArgs(process.argv.slice(2));
  const { actualDatabase, actualUploadsDir } = resolveTargets(database, uploadsDir);
  const client = new PrismaClient({ datasources: { db: { url: `file:${actualDatabase}` } }, log: [] });
  try {
    if (applyManifest) {
      // Nunca promove o que uma nova varredura encontra agora: só reverifica,
      // um a um, exatamente os candidatos que já estavam no manifesto
      // revisado — e só se o manifesto foi gerado para este MESMO banco e
      // pasta (recusa de propósito se apontarem para outro lugar).
      const manifest = await readLegacyMediaManifest(applyManifest);
      const allowlistPath = join(actualUploadsDir, ALLOWLIST_FILENAME);
      const fingerprint = await computeDatabaseFingerprint(actualDatabase);
      const result = await applyLegacyMediaManifest(client, manifest, actualUploadsDir, actualDatabase, fingerprint, allowlistPath);
      console.log(JSON.stringify({ mode: 'applied', manifest: applyManifest, allowlistPath, ...result }, null, 2));
      return;
    }

    const result = await inventoryLegacyMedia(client, actualUploadsDir);
    if (propose) {
      // Só grava o manifesto para revisão humana — nunca a allowlist.
      // Promover exige rodar de novo com --apply-manifest depois de alguém
      // revisar este arquivo.
      const databaseFingerprint = await computeDatabaseFingerprint(actualDatabase);
      await writeLegacyMediaManifest(propose, { generatedAt: new Date().toISOString(), database: actualDatabase, databaseFingerprint, uploadsDir: actualUploadsDir, candidates: result.candidates });
      console.log(JSON.stringify({ mode: 'proposed', manifest: propose, ...result }, null, 2));
      return;
    }
    console.log(JSON.stringify({ mode: 'simulation', ...result }, null, 2));
  } finally {
    await client.$disconnect();
  }
}
void main().catch(error => {
  // Prisma / filesystem errors can contain query arguments, paths or data.
  console.error(error instanceof InventoryError ? error.message : 'Não foi possível executar a operação. Nenhum arquivo foi escrito.');
  process.exitCode = 1;
});
