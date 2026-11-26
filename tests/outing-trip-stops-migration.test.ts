import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

// Migração aditiva da viagem com vários destinos: aplicada sobre um banco com
// saídas já registradas, não muda nenhum valor; o retorno documentado roda.
describe('migração 20261128010000_outing_trip_stops_status com dados existentes', () => {
  it('preserva as saídas, deixa as colunas novas vazias e aceita o retorno', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'overtrip-outing-trip-migration-'));
    const migrationDir = join(directory, 'migrations');
    mkdirSync(migrationDir);
    const source = resolve('prisma/migrations');
    const target = '20261128010000_outing_trip_stops_status';
    for (const name of readdirSync(source)) if (name !== target) cpSync(join(source, name), join(migrationDir, name), { recursive: true });
    cpSync(resolve('prisma/schema.prisma'), join(directory, 'schema.prisma'));
    const database = `file:${join(directory, 'populated.db')}`;
    const prisma = new PrismaClient({ datasources: { db: { url: database } } });
    const migrate = () => spawnSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy', '--schema', join(directory, 'schema.prisma')], { env: { ...process.env, DATABASE_URL: database }, encoding: 'utf8' });
    const snapshot = () => prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT "id", "destinationId", "date", "passengers", "courtesySeats", "pricePerPersonCents", "transportCostCents", "extraCostCents", "supplier", "notes" FROM "DestinationOuting" ORDER BY "id"`;
    try {
      const initial = migrate(); expect(initial.status, initial.stderr).toBe(0);
      await prisma.$executeRaw`INSERT INTO "Destination" ("id", "name", "updatedAt") VALUES ('d1', 'Dique', CURRENT_TIMESTAMP), ('d2', 'Fortaleza', CURRENT_TIMESTAMP)`;
      await prisma.$executeRaw`INSERT INTO "DestinationOuting" ("id", "destinationId", "date", "passengers", "courtesySeats", "pricePerPersonCents", "transportCostCents", "extraCostCents", "supplier", "notes", "updatedAt")
        VALUES ('o1', 'd1', '2026-08-15 12:00:00', 20, 1, 6500, 70000, NULL, 'Fornecedor', 'Registrada a partir do mapa do site.', CURRENT_TIMESTAMP),
               ('o2', 'd2', '2026-08-15 12:00:00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP)`;
      const before = await snapshot();
      await prisma.$disconnect();

      cpSync(join(source, target), join(migrationDir, target), { recursive: true });
      const next = migrate(); expect(next.status, next.stderr).toBe(0);
      expect(next.stdout).toContain(target);
      expect(await snapshot()).toEqual(before);
      expect(await prisma.$queryRaw`SELECT "id", "status", "parentOutingId" FROM "DestinationOuting" ORDER BY "id"`).toEqual([
        { id: 'o1', status: null, parentOutingId: null }, { id: 'o2', status: null, parentOutingId: null },
      ]);
      expect(await prisma.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);

      // Vínculo para uma saída inexistente é recusado pela chave estrangeira.
      await expect(prisma.$executeRaw`UPDATE "DestinationOuting" SET "parentOutingId" = 'missing' WHERE "id" = 'o2'`).rejects.toThrow();
      await prisma.$executeRaw`UPDATE "DestinationOuting" SET "parentOutingId" = 'o1', "status" = NULL WHERE "id" = 'o2'`;
      // Apagar a principal no SQL solta a parada (ON DELETE SET NULL) em vez de apagá-la.
      await prisma.$executeRaw`DELETE FROM "DestinationOuting" WHERE "id" = 'o1'`;
      expect(await prisma.$queryRaw`SELECT "id", "parentOutingId" FROM "DestinationOuting"`).toEqual([{ id: 'o2', parentOutingId: null }]);

      // Retorno documentado na migração.
      await prisma.$executeRawUnsafe('DROP INDEX "DestinationOuting_parentOutingId_idx"');
      await prisma.$executeRawUnsafe('ALTER TABLE "DestinationOuting" DROP COLUMN "parentOutingId"');
      await prisma.$executeRawUnsafe('ALTER TABLE "DestinationOuting" DROP COLUMN "status"');
      expect(await prisma.$queryRaw`SELECT "id", "destinationId" FROM "DestinationOuting"`).toEqual([{ id: 'o2', destinationId: 'd2' }]);
    } finally {
      await prisma.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60000);
});
