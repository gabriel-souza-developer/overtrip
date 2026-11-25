import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { recoverAccountPassword } from '../scripts/lib/recoverAccountPassword';

const directory = mkdtempSync(join(tmpdir(), 'overtrip-account-recovery-'));
const dbFile = join(directory, 'test.db');
const url = `file:${dbFile}`;
const db = new PrismaClient({ datasources: { db: { url } } });
const password = 'senha-nova-teste-123';
const secret = 'chave-ficticia-exclusiva-para-teste-de-sessao';
const cli = (args: string[], input = '') => spawnSync(resolve('node_modules/.bin/tsx'), ['scripts/recover-account-password.ts', ...args], { input, encoding: 'utf8' });
const args = ['--database', url, '--user-id', 'test-user'];
let server: ChildProcess | undefined;

beforeAll(() => { execFileSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' }); }, 30000);
beforeEach(async () => { await db.membership.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany(); });
afterAll(async () => { if (server && server.exitCode === null) server.kill('SIGTERM'); await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

async function makeUser() {
  return db.user.create({ data: { id: 'test-user', email: 'owner@example.test', name: 'Operador', passwordHash: await bcrypt.hash('senha-antiga', 4), legacyAccess: true, role: 'editor' } });
}

describe('recuperação administrativa de senha', () => {
  it('simula sem alterações e atualiza somente senha e versão, preservando papéis e vínculos', async () => {
    const user = await makeUser();
    const org = await db.organization.create({ data: { id: 'org', name: 'Agência', slug: 'agencia' } });
    const membership = await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'OWNER' } });
    expect(await recoverAccountPassword(db, user.id, undefined)).toBe('simulation');
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
    expect(await recoverAccountPassword(db, user.id, password, true)).toBe('applied');
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare(password, updated.passwordHash)).toBe(true);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(user.updatedAt.getTime());
    expect(updated).toMatchObject({ id: user.id, email: user.email, role: user.role, legacyAccess: user.legacyAccess });
    expect(await db.membership.findUniqueOrThrow({ where: { id: membership.id } })).toEqual(membership);
  });

  it('recusa conta inexistente, ID inválido e senhas inseguras sem criar ou alterar usuário', async () => {
    const user = await makeUser();
    await expect(recoverAccountPassword(db, 'missing', password, true)).rejects.toThrow('não encontrada');
    await expect(recoverAccountPassword(db, '../invalid', password, true)).rejects.toThrow('inválido');
    for (const invalid of ['curta', 'á'.repeat(37), 'senha\nquebrada', 'senha\0teste']) {
      await expect(recoverAccountPassword(db, user.id, invalid, true)).rejects.toThrow('Senha inválida');
    }
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
    expect(await db.user.count()).toBe(1);
  });

  it('CLI exige banco existente, rejeita flags repetidas e não expõe senha ou identidade em saída', async () => {
    await makeUser();
    const simulation = cli(args);
    expect(simulation.status).toBe(0); expect(simulation.stdout).toContain('Simulação');
    const applied = cli([...args, '--apply'], `${password}\n`);
    expect(applied.status).toBe(0);
    expect(applied.stdout + applied.stderr).not.toContain(password);
    expect(applied.stdout + applied.stderr).not.toContain('owner@example.test');
    expect(applied.stdout + applied.stderr).not.toContain('test-user');
    expect(cli([...args, '--password', password]).status).not.toBe(0);
    expect(cli([...args, '--user-id', 'other']).status).not.toBe(0);
    expect(cli(['--database', 'file:relative.db', '--user-id', 'test-user']).status).not.toBe(0);
    expect(cli(['--database', `file:${join(directory, 'missing.db')}`, '--user-id', 'test-user']).status).not.toBe(0);
    const fake = join(directory, 'not-sqlite'); writeFileSync(fake, 'not a database');
    expect(cli(['--database', `file:${fake}`, '--user-id', 'test-user']).status).not.toBe(0);
  }, 30000);

  it('revoga token antigo na API real e mantém válido um token da versão nova', async () => {
    const user = await makeUser();
    const port = await new Promise<number>((resolvePort, reject) => {
      const socket = createServer(); socket.once('error', reject);
      socket.listen(0, '127.0.0.1', () => { const address = socket.address(); if (!address || typeof address === 'string') return reject(new Error('porta indisponível')); socket.close(() => resolvePort(address.port)); });
    });
    server = spawn(resolve('node_modules/.bin/tsx'), ['src/index.ts'], {
      env: { ...process.env, DATABASE_URL: url, JWT_SECRET: secret, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', DOCUMENT_STORAGE_DIR: join(directory, 'documents') },
      stdio: 'ignore',
    });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    expect(ready).toBe(true);
    const tokenFor = (updatedAt: Date) => jwt.sign({ id: user.id, email: user.email, role: user.role, sv: updatedAt.getTime() }, secret, { expiresIn: '1h', algorithm: 'HS256' });
    const check = (token: string) => fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const oldToken = tokenFor(user.updatedAt);
    expect((await check(oldToken)).status).toBe(200);
    await recoverAccountPassword(db, user.id, password, true);
    expect((await check(oldToken)).status).toBe(401);
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect((await check(tokenFor(updated.updatedAt))).status).toBe(200);
    server.kill('SIGTERM');
    await new Promise<void>(resolveExit => server!.once('exit', () => resolveExit()));
    server = undefined;
  }, 30000);
});
