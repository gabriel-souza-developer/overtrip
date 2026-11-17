import { closeSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { TextDecoder } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { AccountRecoveryError, recoverAccountPassword } from './lib/recoverAccountPassword.js';

const usage = 'Uso: --database file:/caminho/absoluto --user-id ID [--apply]';

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) throw new AccountRecoveryError('Forneça a senha por stdin sem eco, não por argumento ou variável de ambiente.');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1024) throw new AccountRecoveryError('Entrada de senha muito longa.');
    chunks.push(buffer);
  }
  let input: string;
  try { input = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new AccountRecoveryError('A senha deve usar UTF-8 válido.'); }
  return input.replace(/\r?\n$/, '');
}

async function main() {
  const args = process.argv.slice(2);
  const values: Record<string, string> = {};
  const flags = new Set(['--database', '--user-id']);
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply' && !apply) { apply = true; continue; }
    if (!flags.has(arg) || values[arg] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new AccountRecoveryError(usage);
    values[arg] = args[++i];
  }
  if ([...flags].some(flag => !values[flag])) throw new AccountRecoveryError(usage);
  const rawPath = values['--database'].startsWith('file:') ? values['--database'].slice(5) : '';
  if (!isAbsolute(rawPath) || /[\x00-\x1f?#%]/.test(rawPath)) throw new AccountRecoveryError('Informe um caminho absoluto de banco SQLite existente.');
  const actual = realpathSync(rawPath);
  if (/[\x00-\x1f?#%]/.test(actual)) throw new AccountRecoveryError('Informe um caminho absoluto de banco SQLite existente.');
  const descriptor = openSync(actual, 'r');
  try {
    const header = Buffer.alloc(16);
    if (!fstatSync(descriptor).isFile() || readSync(descriptor, header, 0, 16, 0) !== 16 || header.toString('binary') !== 'SQLite format 3\0') {
      throw new AccountRecoveryError('O arquivo indicado não é um banco SQLite válido.');
    }
  } finally { closeSync(descriptor); }
  const password = apply ? await readPassword() : undefined;
  const client = new PrismaClient({ datasources: { db: { url: `file:${actual}` } }, log: [] });
  let result: 'simulation' | 'applied';
  try { result = await recoverAccountPassword(client, values['--user-id'], password, apply); }
  finally { await client.$disconnect(); }
  console.log(result === 'applied' ? 'Senha redefinida e sessões anteriores revogadas.' : 'Simulação concluída; nenhuma alteração foi feita.');
}

void main().catch((error: unknown) => {
  console.error(error instanceof AccountRecoveryError ? error.message : 'Não foi possível concluir a recuperação. Verifique o estado do banco antes de tentar novamente.');
  process.exitCode = 1;
});
