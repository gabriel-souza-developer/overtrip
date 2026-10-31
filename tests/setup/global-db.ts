import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Banco SQLite próprio dos testes: nunca toca prisma/dev.db (dados de desenvolvimento).
export const TEST_DB_PATH = resolve(__dirname, '../../prisma/test.db');
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;

export default function setup() {
  for (const suffix of ['', '-journal']) rmSync(TEST_DB_PATH + suffix, { force: true });
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
