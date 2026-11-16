import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';

describe('carga de demonstração isolada', () => {
  it('cria somente em banco vazio, preserva dados e recusa reaplicação', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'overtrip-demo-seed-test-'));
    const url = `file:${join(directory, 'demo.db')}`;
    const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: url };
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      const migration = spawnSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env, encoding: 'utf8' });
      expect(migration.status, migration.stderr).toBe(0);
      const seedEnv = { ...env, DATABASE_URL: `file:${join(directory, 'other.db')}`, PLATFORM_DATABASE_URL: url, PLATFORM_DEMO_EMAIL: 'demo@example.test', PLATFORM_DEMO_PASSWORD: 'senha-demo-ficticia' };
      const seed = () => spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/platform-demo-seed.ts')], { env: seedEnv, encoding: 'utf8' });
      expect(seed().status).toBe(0);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.membership.count()).toBe(1);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'demo@example.test' }, include: { memberships: { include: { organization: true } } } });
      expect(await bcrypt.compare('senha-demo-ficticia', user.passwordHash)).toBe(true);
      expect(user.memberships[0]).toMatchObject({ role: 'owner', organization: { niche: 'pousada' } });
      const repeated = seed();
      expect(repeated.status).not.toBe(0);
      expect(repeated.stderr).toContain('banco de demonstração vazio');
      expect(await prisma.user.count()).toBe(1);
      const same = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/platform-demo-seed.ts')], { env: { ...seedEnv, DATABASE_URL: url }, encoding: 'utf8' });
      expect(same.status).not.toBe(0);
      expect(same.stderr).toContain('deve ser diferente');
      await prisma.membership.deleteMany();
      await prisma.organization.deleteMany();
      await prisma.user.deleteMany();
      await prisma.setting.create({ data: { key: 'existing', value: 'preserve' } });
      const nonempty = seed();
      expect(nonempty.status).not.toBe(0);
      expect(await prisma.setting.count()).toBe(1);
      expect(await prisma.user.count()).toBe(0);
    } finally {
      await prisma.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});
