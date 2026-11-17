import { realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { BackfillError, backfillTourismOrganizations } from './lib/tourismOrganizationBackfill.js';

async function main() {
  const args = process.argv.slice(2);
  let database = ''; let organizationId = ''; let apply = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--database' && !database && args[index + 1]) database = args[++index];
    else if (arg === '--organization' && !organizationId && args[index + 1]) organizationId = args[++index];
    else if (arg === '--apply' && !apply) apply = true;
    else throw new BackfillError('Uso: --database file:/caminho/absoluto --organization ID [--apply]');
  }
  const path = database.startsWith('file:') ? database.slice(5) : '';
  if (!organizationId || !path || !isAbsolute(path) || path.includes('?') || path.includes('#')) {
    throw new BackfillError('Informe --database file:/caminho/absoluto e --organization ID. Por padrão nenhuma alteração é feita.');
  }
  // Refuse implicit database creation and prevent URL options from changing the target.
  const actual = realpathSync(path);
  if (!statSync(actual).isFile()) throw new BackfillError('O banco indicado deve ser um arquivo SQLite existente.');
  if (/[?#%]/.test(actual)) throw new BackfillError('O caminho real do banco não pode conter caracteres especiais de URI.');
  const client = new PrismaClient({ datasources: { db: { url: `file:${actual}` } }, log: [] });
  try { console.log(JSON.stringify(await backfillTourismOrganizations(client, organizationId, apply), null, 2)); }
  finally { await client.$disconnect(); }
}
void main().catch(error => {
  // Prisma / filesystem errors can contain query arguments, paths or data.
  console.error(error instanceof BackfillError ? error.message : 'Não foi possível executar a operação. Nenhuma alteração foi aplicada.');
  process.exitCode = 1;
});
