import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

// Migração aditiva da origem da saída: aplicada sobre um banco com saídas já
// registradas, só preenche "source" (SITE para as criadas pela sincronização,
// pela mesma regra que o código anterior aplicava às notas), não muda nenhum
// outro valor e o retorno documentado roda.

// Regra do código anterior (SITE_CREATED_NOTE), mantida aqui só para comparar.
const LEGACY_SITE_NOTE = /^(Registrada a partir do mapa do site\.|Visita registrada no mapa do site, sem data\.|Registrada a partir da viagem do site\.)/;

describe('migração 20261129010000_outing_source com dados existentes', () => {
  it('classifica só as saídas automáticas do site, preserva o resto e aceita o retorno', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'overtrip-outing-source-migration-'));
    const migrationDir = join(directory, 'migrations');
    mkdirSync(migrationDir);
    const source = resolve('prisma/migrations');
    const target = '20261129010000_outing_source';
    // Só as migrações anteriores à testada (as posteriores dependem dela).
    for (const name of readdirSync(source)) if (!/^\d/.test(name) || name < target) cpSync(join(source, name), join(migrationDir, name), { recursive: true });
    cpSync(resolve('prisma/schema.prisma'), join(directory, 'schema.prisma'));
    const database = `file:${join(directory, 'populated.db')}`;
    const prisma = new PrismaClient({ datasources: { db: { url: database } } });
    const migrate = () => spawnSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy', '--schema', join(directory, 'schema.prisma')], { env: { ...process.env, DATABASE_URL: database }, encoding: 'utf8' });
    const snapshot = () => prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT "id", "destinationId", "date", "status", "parentOutingId", "passengers", "courtesySeats", "pricePerPersonCents", "transportCostCents", "extraCostCents", "supplier", "notes", "createdAt", "updatedAt" FROM "DestinationOuting" ORDER BY "id"`;
    const notes: Record<string, string | null> = {
      s1: 'Registrada a partir do mapa do site.',
      s2: 'Visita registrada no mapa do site, sem data.',
      s3: 'Registrada a partir da viagem do site.',
      s4: 'Registrada a partir do mapa do site. Conferir fotos.', // nota acrescentada depois: a regra anterior também era por prefixo
      t1: null, // equipe ou planilha sem nota
      t2: 'Saída com camping.', // planilha
      t3: 'Mês registrado na planilha: maio/2024 (dia não informado).',
      t4: 'registrada a partir do mapa do site.', // minúscula: não é o texto do site
      t5: 'Turma nova. Registrada a partir do mapa do site.', // texto do site no meio: não é automática
      t6: 'Juntada a uma viagem com vários destinos: valores iguais aos da saída principal ficaram só nela.',
      t7: 'Viagem realizada (data conforme o mapa do site).', // correção da planilha
      t8: ' Registrada a partir do mapa do site.', // espaço antes: não casa
    };
    try {
      const initial = migrate(); expect(initial.status, initial.stderr).toBe(0);
      await prisma.$executeRaw`INSERT INTO "Organization" ("id", "name", "slug", "updatedAt") VALUES ('org-b', 'Outra', 'outra', CURRENT_TIMESTAMP)`;
      await prisma.$executeRaw`INSERT INTO "Destination" ("id", "name", "updatedAt") VALUES ('d1', 'Dique', CURRENT_TIMESTAMP)`;
      await prisma.$executeRaw`INSERT INTO "Destination" ("id", "name", "organizationId", "updatedAt") VALUES ('d2', 'Alheio', 'org-b', CURRENT_TIMESTAMP)`;
      for (const [id, note] of Object.entries(notes)) {
        await prisma.$executeRaw`INSERT INTO "DestinationOuting" ("id", "destinationId", "date", "status", "passengers", "pricePerPersonCents", "supplier", "notes", "updatedAt")
          VALUES (${id}, ${id === 's3' ? 'd2' : 'd1'}, '2025-08-15 12:00:00', ${id === 's2' ? 'REALIZED' : null}, 10, 5000, 'Fornecedor', ${note}, '2025-08-20 10:00:00')`;
      }
      await prisma.$executeRaw`UPDATE "DestinationOuting" SET "parentOutingId" = 's1' WHERE "id" = 't6'`;
      const before = await snapshot();
      await prisma.$disconnect();

      cpSync(join(source, target), join(migrationDir, target), { recursive: true });
      const next = migrate(); expect(next.status, next.stderr).toBe(0);
      expect(next.stdout).toContain(target);
      // Nenhum outro valor muda (nem updatedAt), nenhuma linha some.
      expect(await snapshot()).toEqual(before);
      const rows = await prisma.$queryRaw<Array<{ id: string; source: string | null }>>`SELECT "id", "source" FROM "DestinationOuting" ORDER BY "id"`;
      expect(Object.fromEntries(rows.map((row) => [row.id, row.source]))).toEqual({
        s1: 'SITE', s2: 'SITE', s3: 'SITE', s4: 'SITE',
        t1: null, t2: null, t3: null, t4: null, t5: null, t6: null, t7: null, t8: null,
      });
      // Mesma classificação que a regra anterior: nenhuma saída muda de situação ou de totais.
      for (const row of rows) expect(row.source === 'SITE', row.id).toBe(LEGACY_SITE_NOTE.test(notes[row.id] ?? ''));
      // A migração não olha a empresa: só marca a origem; o escopo continua nas consultas.
      expect(await prisma.$queryRaw`SELECT "id", "destinationId" FROM "DestinationOuting" WHERE "id" = 's3'`).toEqual([{ id: 's3', destinationId: 'd2' }]);
      expect(await prisma.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);

      // Rodar de novo não faz nada (migração já aplicada).
      const again = migrate(); expect(again.status, again.stderr).toBe(0);
      expect(await prisma.$queryRaw`SELECT COUNT(*) AS "n" FROM "DestinationOuting" WHERE "source" = 'SITE'`).toEqual([{ n: 4n }]);

      // Retorno documentado na migração.
      await prisma.$executeRawUnsafe('ALTER TABLE "DestinationOuting" DROP COLUMN "source"');
      const after = await snapshot();
      expect(after).toEqual(before);
    } finally {
      await prisma.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60000);
});
