import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let base: string;
let admin: string;
let editor: string;
let adminId: string;
const ids: string[] = [];
const tag = `manage-${Date.now()}`;
const call = (token: string, path: string, method = 'GET', data?: unknown) => fetch(`${base}/api/users${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });

beforeAll(async () => {
  const hash = await bcrypt.hash('password-123', 4);
  const a = await prisma.user.create({ data: { email: `${tag}-admin@example.test`, name: 'Admin', passwordHash: hash, role: 'admin', legacyAccess: true } });
  const e = await prisma.user.create({ data: { email: `${tag}-editor@example.test`, name: 'Editor', passwordHash: hash, role: 'editor', legacyAccess: true } });
  const other = await prisma.user.create({ data: { email: `${tag}-other@example.test`, name: 'Outra empresa', passwordHash: hash, role: 'admin', legacyAccess: false } });
  ids.push(a.id, e.id, other.id); adminId = a.id; admin = generateToken(a); editor = generateToken(e);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('gestão de usuários do painel', () => {
  it('restringe a administradores e não expõe contas de outra empresa', async () => {
    expect((await call(editor, '')).status).toBe(403);
    expect((await call(editor, '', 'POST', { name: 'X', email: 'x@example.test', role: 'admin' })).status).toBe(403);
    const list = await (await call(admin, '')).json();
    expect(list.some((u: { email: string }) => u.email === `${tag}-other@example.test`)).toBe(false);
    expect(JSON.stringify(list)).not.toContain('passwordHash');
  });
  it('recusa alteração disparada de outra origem usando cookie', async () => {
    const response = await fetch(`${base}/api/users`, { method: 'POST', headers: { Cookie: `overtrip_session=${admin}`, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', email: `${tag}-csrf@example.test`, role: 'admin' }) });
    expect(response.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { email: `${tag}-csrf@example.test` } })).toBeNull();
  });
  it('revalida o administrador na transação depois que a permissão é revogada', async () => {
    const realHash = bcrypt.hash.bind(bcrypt);
    const spy = vi.spyOn(bcrypt, 'hash').mockImplementationOnce(async (...args: Parameters<typeof bcrypt.hash>) => {
      await prisma.user.update({ where: { id: adminId }, data: { role: 'editor' } });
      return realHash(...args);
    });
    try {
      const response = await call(admin, '', 'POST', { name: 'X', email: `${tag}-race@example.test`, role: 'admin' });
      expect(response.status).toBe(403);
      expect(await prisma.user.findUnique({ where: { email: `${tag}-race@example.test` } })).toBeNull();
    } finally {
      spy.mockRestore();
      const restored = await prisma.user.update({ where: { id: adminId }, data: { role: 'admin' } });
      admin = generateToken(restored);
    }
  });
  it('cria senha aleatória individual, exige troca e rejeita e-mail duplicado sem diferenciar caixa', async () => {
    const address = `${tag}-new@example.test`;
    const response = await call(admin, '', 'POST', { name: 'Pessoa', email: address, role: 'admin' });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const result = await response.json(); ids.push(result.user.id);
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(20);
    expect(result.user.mustChangePassword).toBe(true);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });
    expect(await bcrypt.compare(result.temporaryPassword, saved.passwordHash)).toBe(true);
    expect((await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: address, password: result.temporaryPassword }) })).status).toBe(200);
    expect((await call(admin, '', 'POST', { name: 'Pessoa', email: address.toUpperCase(), role: 'admin' })).status).toBe(409);
    expect((await call(admin, `/${adminId}`, 'PATCH', { role: 'editor' })).status).toBe(400);
  });
  it('mudar a permissão encerra as sessões anteriores', async () => {
    const existing = await prisma.user.findFirstOrThrow({ where: { email: `${tag}-editor@example.test` } });
    expect((await call(admin, `/${existing.id}`, 'PATCH', { role: 'admin' })).status).toBe(200);
    expect((await call(editor, '')).status).toBe(401);
  });
});
