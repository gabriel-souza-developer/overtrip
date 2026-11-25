import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ProvisionError, provisionOrganization, type ProvisionInput } from './lib/provisionOrganization.js';

const usage = 'Uso: --database file:/caminho/absoluto --organization-id ID --organization-name NOME --slug SLUG --email EMAIL --user-name NOME [--apply]';

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) throw new ProvisionError('Forneça a senha por stdin sem eco, não por argumento ou variável de ambiente.');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1024) throw new ProvisionError('Entrada de senha muito longa.');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.replace(/\r?\n$/, '');
}

async function main() {
  const args = process.argv.slice(2);
  const values: Record<string, string> = {};
  const flags = new Set(['--database', '--organization-id', '--organization-name', '--slug', '--email', '--user-name']);
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply' && !apply) { apply = true; continue; }
    if (!flags.has(arg) || values[arg] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new ProvisionError(usage);
    values[arg] = args[++i];
  }
  if ([...flags].some(flag => !values[flag])) throw new ProvisionError(usage);
  const rawPath = values['--database'].startsWith('file:') ? values['--database'].slice(5) : '';
  if (!isAbsolute(rawPath) || /[?#%]/.test(rawPath)) throw new ProvisionError('Informe um caminho absoluto de banco SQLite existente.');
  const actual = realpathSync(rawPath);
  if (/[?#%]/.test(actual) || !statSync(actual).isFile()) throw new ProvisionError('Informe um arquivo SQLite existente.');
  const descriptor = openSync(actual, 'r');
  try {
    const header = Buffer.alloc(16);
    if (readSync(descriptor, header, 0, 16, 0) !== 16 || header.toString('binary') !== 'SQLite format 3\0') throw new ProvisionError('O arquivo indicado não é um banco SQLite válido.');
  } finally { closeSync(descriptor); }
  const input: ProvisionInput = { organizationId: values['--organization-id'], organizationName: values['--organization-name'], slug: values['--slug'], email: values['--email'], userName: values['--user-name'] };
  const password = apply ? await readPassword() : undefined;
  const client = new PrismaClient({ datasources: { db: { url: `file:${actual}` } }, log: [] });
  try {
    const result = await provisionOrganization(client, input, password, apply);
    console.log(result === 'applied' ? 'Empresa e acesso inicial criados.' : 'Simulação concluída; nenhuma alteração foi feita.');
  } finally { await client.$disconnect(); }
}

void main().catch((error: unknown) => {
  console.error(error instanceof ProvisionError ? error.message : 'Não foi possível concluir o provisionamento. Verifique o estado do banco antes de tentar novamente.');
  process.exitCode = 1;
});
