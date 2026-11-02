import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('migrações SQLite', () => {
  it('cria um banco vazio compatível com o schema atual', () => {
    const dir = mkdtempSync(join(tmpdir(), 'overtrip-migrations-'));
    const url = `file:${join(dir, 'migrations.db')}`;
    const prisma = resolve('node_modules/.bin/prisma');
    const env = { ...process.env, DATABASE_URL: url };
    try {
      execFileSync(prisma, ['migrate', 'deploy'], { env, stdio: 'pipe' });
      expect(execFileSync(prisma, ['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], { env, encoding: 'utf8' })).toContain('No difference detected');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
});
