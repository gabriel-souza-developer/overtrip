import { describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('migração preparatória de organizationId em Visit/GalleryEntry', () => {
  it('preserva visitas, memórias da galeria e seus vínculos existentes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'overtrip-visit-gallery-migration-'));
    const database = join(directory, 'test.db');
    const schema = join(directory, 'schema.prisma');
    const migrations = join(directory, 'migrations');
    const migrationName = '20261117110000_visit_gallery_organization_preparation';
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
c.execute("INSERT INTO Trip (id,title,category,description,city,region,startDateISO,intensityClass,includes,media,storedIdentity,updatedAt) VALUES ('trip-a','Viagem fictícia','Teste','Exemplo','Cidade','PB','2030-01-01','light','[]','[]','fixture-trip','2030-01-01')")
c.execute("INSERT INTO Visit (id,title,city,region,storedIdentity,tripId,updatedAt) VALUES ('visit-a','Visita fictícia','Cidade','PB','fixture-visit','trip-a','2030-01-01')")
c.execute("INSERT INTO GalleryEntry (id,title,date,dateDisplay,description,images,orderIndex,storedIdentity,tripId,visitId,updatedAt) VALUES ('gallery-a','Memória fictícia','2030-01-01','1 de janeiro de 2030','Descrição fictícia','[]',0,'fixture-gallery','trip-a','visit-a','2030-01-01')")
c.commit(); c.close()`);
      const snapshot = `import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); c.row_factory=sqlite3.Row
result={}
for name in ['Trip','Visit','GalleryEntry']:
 result[name]=[{k:row[k] for k in row.keys() if k!='organizationId'} for row in c.execute('SELECT * FROM "'+name+'" ORDER BY id')]
print(json.dumps(result,sort_keys=True,ensure_ascii=False))`;
      const before = python(snapshot);
      cpSync(join('prisma/migrations', migrationName), join(migrations, migrationName), { recursive: true });
      deploy();
      expect(python(snapshot)).toBe(before);
      const checks = python(`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); c.execute('PRAGMA foreign_keys=ON')
result={'unassigned':[c.execute('SELECT organizationId FROM "'+n+'"').fetchone()[0] for n in ['Visit','GalleryEntry']],'violations':c.execute('PRAGMA foreign_key_check').fetchall()}
try:
 c.execute("UPDATE Visit SET organizationId='missing' WHERE id='visit-a'")
 result['invalid_visit_allowed']=True
except sqlite3.IntegrityError:
 result['invalid_visit_allowed']=False
try:
 c.execute("UPDATE GalleryEntry SET organizationId='missing' WHERE id='gallery-a'")
 result['invalid_gallery_allowed']=True
except sqlite3.IntegrityError:
 result['invalid_gallery_allowed']=False
print(json.dumps(result))`);
      expect(JSON.parse(checks)).toEqual({
        unassigned: [null, null],
        violations: [],
        invalid_visit_allowed: false,
        invalid_gallery_allowed: false,
      });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }, 30000);
});
