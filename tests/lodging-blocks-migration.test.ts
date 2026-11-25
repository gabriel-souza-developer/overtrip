import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

describe('migração de bloqueios com dados existentes', () => {
  it('preserva noites anteriores e impõe um único proprietário para cada noite', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'overtrip-block-migration-'));
    const migrationDir = join(directory, 'migrations');
    mkdirSync(migrationDir);
    const source = resolve('prisma/migrations');
    const targetMigration = '20261123020000_lodging_blocks';
    for (const name of readdirSync(source)) if (name !== targetMigration) cpSync(join(source, name), join(migrationDir, name), { recursive: true });
    cpSync(resolve('prisma/schema.prisma'), join(directory, 'schema.prisma'));
    const database = `file:${join(directory, 'populated.db')}`;
    const prisma = new PrismaClient({ datasources: { db: { url: database } } });
    const migrate = () => spawnSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy', '--schema', join(directory, 'schema.prisma')], { env: { ...process.env, DATABASE_URL: database }, encoding: 'utf8' });
    try {
      const initial = migrate(); expect(initial.status, initial.stderr).toBe(0);
      await prisma.$executeRaw`INSERT INTO "Organization" ("id", "name", "slug", "niche", "updatedAt") VALUES ('org', 'A', 'migration-blocks', 'pousada', CURRENT_TIMESTAMP)`;
      await prisma.$executeRaw`INSERT INTO "LodgingUnit" ("id", "organizationId", "name") VALUES ('unit', 'org', 'Quarto')`;
      await prisma.$executeRaw`INSERT INTO "LodgingReservation" ("id", "organizationId", "unitId", "guestName", "checkIn", "checkOut") VALUES ('booking', 'org', 'unit', 'Pessoa', '2032-01-01', '2032-01-03')`;
      await prisma.$executeRaw`INSERT INTO "LodgingNight" ("reservationId", "unitId", "night") VALUES ('booking', 'unit', '2032-01-01'), ('booking', 'unit', '2032-01-02')`;
      await prisma.$disconnect();
      cpSync(join(source, targetMigration), join(migrationDir, targetMigration), { recursive: true });
      const next = migrate(); expect(next.status, next.stderr).toBe(0);
      expect(next.stdout).toContain(targetMigration);
      const nights = await prisma.$queryRaw<{ reservationId: string; blockId: string | null; night: string }[]>`SELECT "reservationId", "blockId", "night" FROM "LodgingNight" ORDER BY "night"`;
      expect(nights).toEqual([{ reservationId: 'booking', blockId: null, night: '2032-01-01' }, { reservationId: 'booking', blockId: null, night: '2032-01-02' }]);
      expect(await prisma.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
      await expect(prisma.$executeRaw`INSERT INTO "LodgingNight" ("unitId", "night") VALUES ('unit', '2032-01-04')`).rejects.toThrow();
      await prisma.$executeRaw`INSERT INTO "LodgingBlock" ("id", "organizationId", "unitId", "start", "end") VALUES ('block', 'org', 'unit', '2032-01-03', '2032-01-04')`;
      await expect(prisma.$executeRaw`INSERT INTO "LodgingNight" ("reservationId", "blockId", "unitId", "night") VALUES ('booking', 'block', 'unit', '2032-01-03')`).rejects.toThrow();
      await expect(prisma.$executeRaw`INSERT INTO "LodgingNight" ("blockId", "unitId", "night") VALUES ('missing', 'unit', '2032-01-03')`).rejects.toThrow();
      await prisma.$executeRaw`INSERT INTO "LodgingNight" ("blockId", "unitId", "night") VALUES ('block', 'unit', '2032-01-03')`;
      expect(await prisma.lodgingNight.count()).toBe(3);
    } finally {
      await prisma.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});
