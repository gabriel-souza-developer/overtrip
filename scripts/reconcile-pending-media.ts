import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { MIN_OLDER_THAN_MS, ReconciliationError, reconcilePendingMedia } from './lib/pendingMediaReconciliation.js';

const DEFAULT_OLDER_THAN_MINUTES = 60;
const MIN_OLDER_THAN_MINUTES = MIN_OLDER_THAN_MS / 60000;

async function main() {
  const args = process.argv.slice(2);
  let database = ''; let uploadsDir = ''; let applyRequested = false; let olderThanMinutes = DEFAULT_OLDER_THAN_MINUTES;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--database' && !database && args[index + 1]) database = args[++index];
    else if (arg === '--uploads-dir' && !uploadsDir && args[index + 1]) uploadsDir = args[++index];
    // --apply é aceito (nunca rejeitado, para não quebrar automação externa
    // que já o chamava), mas não faz mais nada: esta ferramenta é só
    // diagnóstico (ver scripts/lib/pendingMediaReconciliation.ts — publicar
    // ou tratar um pendente é sempre decisão manual, fora daqui).
    else if (arg === '--apply' && !applyRequested) applyRequested = true;
    else if (arg === '--older-than-minutes' && args[index + 1]) olderThanMinutes = Number(args[++index]);
    else throw new ReconciliationError('Uso: --database file:/caminho/absoluto --uploads-dir /caminho/absoluto [--older-than-minutes N] [--apply, aceito mas sem efeito]');
  }
  const path = database.startsWith('file:') ? database.slice(5) : '';
  if (!path || !isAbsolute(path) || path.includes('?') || path.includes('#')) {
    throw new ReconciliationError('Informe --database file:/caminho/absoluto e --uploads-dir /caminho/absoluto. Por padrão nenhuma alteração é feita.');
  }
  if (!uploadsDir || !isAbsolute(uploadsDir)) {
    throw new ReconciliationError('Informe --uploads-dir com um caminho absoluto existente.');
  }
  if (!Number.isFinite(olderThanMinutes) || olderThanMinutes < MIN_OLDER_THAN_MINUTES) {
    throw new ReconciliationError(`--older-than-minutes deve ser pelo menos ${MIN_OLDER_THAN_MINUTES} (evita confundir envio lento em andamento com abandonado).`);
  }
  // Refuse implicit database creation and prevent URL options from changing the target.
  const actualDatabase = realpathSync(path);
  if (!statSync(actualDatabase).isFile()) throw new ReconciliationError('O banco indicado deve ser um arquivo SQLite existente.');
  if (/[?#%]/.test(actualDatabase)) throw new ReconciliationError('O caminho real do banco não pode conter caracteres especiais de URI.');
  const actualUploadsDir = realpathSync(uploadsDir);
  if (!statSync(actualUploadsDir).isDirectory()) throw new ReconciliationError('--uploads-dir deve ser um diretório existente.');

  const client = new PrismaClient({ datasources: { db: { url: `file:${actualDatabase}` } }, log: [] });
  try {
    const result = await reconcilePendingMedia(client, actualUploadsDir, olderThanMinutes * 60000);
    const note = applyRequested ? 'mode é sempre diagnóstico: --apply foi ignorado, nenhuma publicação ou remoção é feita automaticamente.' : undefined;
    console.log(JSON.stringify({ mode: 'diagnostic', olderThanMinutes, ...(note ? { note } : {}), ...result }, null, 2));
  } finally {
    await client.$disconnect();
  }
}
void main().catch(error => {
  // Prisma / filesystem errors can contain query arguments, paths or data.
  console.error(error instanceof ReconciliationError ? error.message : 'Não foi possível executar a operação. Nenhuma alteração foi aplicada.');
  process.exitCode = 1;
});
