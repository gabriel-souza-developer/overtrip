import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';

const adminEmail = 'admin@overtrip.com.br';
const fixturePassword = 'senha-ficticia-segura';
async function withDatabase(run: (url: string, db: PrismaClient) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'overtrip-seed-isolated-'));
  const url = `file:${join(dir, 'test.db')}`;
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const migration = spawnSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', timeout: 30000 });
    expect(migration.status, migration.stderr).toBe(0);
    await run(url, db);
  } finally { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
}
function seed(url: string, password?: string) {
  const env = { ...process.env, DATABASE_URL: url };
  if (password === undefined) delete env.ADMIN_PASSWORD;
  else env.ADMIN_PASSWORD = password;
  return spawnSync(process.execPath, ['--import', 'tsx', resolve('prisma/seed.ts')], { env, encoding: 'utf8', timeout: 30000 });
}

describe('operador legado inicial', () => {
  it('inicializa somente banco sem usuários e repetição preserva permissões e senha', async () => withDatabase(async (url, db) => {
    const first = seed(url, fixturePassword);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout + first.stderr).not.toContain(fixturePassword);
    const initial = await db.user.findUniqueOrThrow({ where: { email: adminEmail } });
    expect(initial).toMatchObject({ role: 'admin', legacyAccess: true });
    expect(await bcrypt.compare(fixturePassword, initial.passwordHash)).toBe(true);
    await db.user.update({ where: { id: initial.id }, data: { legacyAccess: false, role: 'user' } });
    const repeated = seed(url);
    expect(repeated.status, repeated.stderr).toBe(0);
    const preserved = await db.user.findUniqueOrThrow({ where: { id: initial.id } });
    expect(preserved).toMatchObject({ role: 'user', legacyAccess: false, passwordHash: initial.passwordHash });
    expect(await db.user.count()).toBe(1);
  }), 45000);
  it('recusa criar operador global se outro usuário já existe', async () => withDatabase(async (url, db) => {
    await db.user.create({ data: { email: 'existing@example.test', passwordHash: 'fixture', role: 'user' } });
    const result = seed(url, fixturePassword);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('já possui usuários');
    expect(result.stdout + result.stderr).not.toContain(fixturePassword);
    expect(await db.user.count()).toBe(1);
    expect(await db.user.findUnique({ where: { email: adminEmail } })).toBeNull();
  }), 45000);
  it('não cria operador sem senha válida', async () => withDatabase(async (url, db) => {
    const result = seed(url);
    expect(result.status).not.toBe(0);
    expect(await db.user.count()).toBe(0);
  }), 45000);
});
