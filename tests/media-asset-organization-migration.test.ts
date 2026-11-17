import { describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('migração preparatória de organizationId em MediaAsset', () => {
  it('preserva arquivos de mídia já registrados', () => {
    const directory = mkdtempSync(join(tmpdir(), 'overtrip-media-asset-migration-'));
    const database = join(directory, 'test.db');
    const schema = join(directory, 'schema.prisma');
    const migrations = join(directory, 'migrations');
    const migrationName = '20261117130000_media_asset_organization_preparation';
    const prisma = resolve('node_modules/.bin/prisma');
    const env = { ...process.env, DATABASE_URL: `file:${database}` };
    const deploy = () => execFileSync(prisma, ['migrate', 'deploy', '--schema', schema], { env, stdio: 'pipe' });
    const python = (script: string) => execFileSync('python3', ['-c', script, database], { encoding: 'utf8' }).trim();
    try {
      mkdirSync(migrations);
      cpSync('prisma/schema.prisma', schema);
      for (const entry of readdirSync('prisma/migrations')) {
        if (entry !== migrationName) cpSync(join('prisma/migrations', entry), join(migrations, entry), { recursive: true });
      }
      deploy();
      python(`import sqlite3,sys
c=sqlite3.connect(sys.argv[1]); c.execute('PRAGMA foreign_keys=ON')
c.execute("INSERT INTO User (id,email,passwordHash,role,updatedAt) VALUES ('user-a','fixture@example.test','fixture','admin','2030-01-01')")
c.execute("INSERT INTO MediaAsset (id,storageKey,path,mimeType,width,height,sizeBytes,originalBytes,sha256,createdById) VALUES ('media-a','0123456789abcdef0123456789abcdef','/api/public/media/0123456789abcdef0123456789abcdef.jpg','image/jpeg',10,10,100,100,'fixture-sha','user-a')")
c.commit(); c.close()`);
      const snapshot = `import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); c.row_factory=sqlite3.Row
result=[{k:row[k] for k in row.keys() if k!='organizationId'} for row in c.execute('SELECT * FROM "MediaAsset" ORDER BY id')]
print(json.dumps(result,sort_keys=True,ensure_ascii=False))`;
      const before = python(snapshot);
      cpSync(join('prisma/migrations', migrationName), join(migrations, migrationName), { recursive: true });
      deploy();
      expect(python(snapshot)).toBe(before);
      const checks = python(`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); c.execute('PRAGMA foreign_keys=ON')
result={'unassigned':c.execute('SELECT organizationId FROM "MediaAsset"').fetchone()[0],'violations':c.execute('PRAGMA foreign_key_check').fetchall()}
try:
 c.execute("UPDATE MediaAsset SET organizationId='missing' WHERE id='media-a'")
 result['invalid_allowed']=True
except sqlite3.IntegrityError:
 result['invalid_allowed']=False
print(json.dumps(result))`);
      expect(JSON.parse(checks)).toEqual({ unassigned: null, violations: [], invalid_allowed: false });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30000);
});
