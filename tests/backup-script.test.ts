import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const script = resolve(__dirname, '../deploy/backup-sqlite.sh');
const hasSqlite = spawnSync('sqlite3', ['-version']).status === 0;

describe.skipIf(!hasSqlite)('backup-sqlite.sh', () => {
  it('gera backup legível e apaga os antigos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bk-'));
    const db = join(dir, 'a.db');
    spawnSync('sqlite3', [db, 'create table t(x); insert into t values (42);']);
    const dest = join(dir, 'out');
    const old = join(dest, 'overtrip-antigo.db.gz');
    spawnSync('mkdir', ['-p', dest]);
    writeFileSync(old, 'x');
    const past = new Date(Date.now() - 20 * 86400_000);
    utimesSync(old, past, past);

    const r = spawnSync('bash', [script, db, dest, '14'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const files = readdirSync(dest);
    expect(files).not.toContain('overtrip-antigo.db.gz');
    const gz = files.find((f) => f.endsWith('.db.gz'))!;
    const restored = join(dir, 'r.db');
    writeFileSync(restored, gunzipSync(readFileSync(join(dest, gz))));
    expect(spawnSync('sqlite3', [restored, 'select x from t;'], { encoding: 'utf8' }).stdout.trim()).toBe('42');
  });
  it('falha com banco inexistente', () => {
    expect(spawnSync('bash', [script, '/nao/existe.db', tmpdir()]).status).not.toBe(0);
  });
});
