import { describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('migração da permissão do painel legado', () => {
  it('preserva contas preexistentes e nega por padrão contas criadas depois', () => {
    const dir = mkdtempSync(join(tmpdir(), 'overtrip-legacy-gate-'));
    const database = join(dir, 'test.db'); const schema = join(dir, 'schema.prisma'); const migrations = join(dir, 'migrations');
    const name = '20261117100000_legacy_access_gate';
    const env = { ...process.env, DATABASE_URL: `file:${database}` };
    const deploy = () => execFileSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy', '--schema', schema], { env, stdio: 'pipe' });
    const python = (code: string) => execFileSync('python3', ['-c', code, database], { encoding: 'utf8' }).trim();
    try {
      mkdirSync(migrations); cpSync('prisma/schema.prisma', schema);
      for (const entry of readdirSync('prisma/migrations')) if (entry !== name) cpSync(join('prisma/migrations', entry), join(migrations, entry), { recursive: true });
      deploy();
      python(`import sqlite3,sys
c=sqlite3.connect(sys.argv[1]); c.execute("INSERT INTO User(id,email,passwordHash,role,updatedAt) VALUES('old','old@example.test','hash','admin','2030-01-01')"); c.commit(); c.close()`);
      cpSync(join('prisma/migrations', name), join(migrations, name), { recursive: true }); deploy();
      const result = python(`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); c.execute("INSERT INTO User(id,email,passwordHash,role,updatedAt) VALUES('new','new@example.test','hash','admin','2030-01-01')"); c.commit()
print(json.dumps(c.execute('SELECT id,legacyAccess,updatedAt FROM User ORDER BY id').fetchall())); c.close()`);
      expect(JSON.parse(result)).toEqual([['new', 0, '2030-01-01'], ['old', 1, '2030-01-01']]);
      deploy();
      expect(python(`import sqlite3,sys
c=sqlite3.connect(sys.argv[1]); print(c.execute("SELECT legacyAccess FROM User WHERE id='new'").fetchone()[0]); c.close()`)).toBe('0');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 30000);
});
