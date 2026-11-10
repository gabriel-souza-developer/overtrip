import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { config } from '../src/config.js';

let server: Server;
let base: string;
const email = `session-${Date.now()}@example.test`;
const pass = 'senha-teste-123';
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
async function login(password = pass): Promise<string> {
  const response = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  expect(response.status).toBe(200);
  return (await response.json() as { token: string }).token;
}

beforeAll(async () => {
  await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(pass, 4), role: 'admin' } });
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('revogação persistente de sessões', () => {
  it('encerra todas as sessões da conta no logout e permite um novo login', async () => {
    const a = await login();
    const b = await login();
    expect((await fetch(`${base}/me`, { headers: auth(a) })).status).toBe(200);
    expect((await fetch(`${base}/logout`, { method: 'POST', headers: auth(a) })).status).toBe(204);
    expect((await fetch(`${base}/me`, { headers: auth(a) })).status).toBe(401);
    expect((await fetch(`${base}/me`, { headers: auth(b) })).status).toBe(401);
    const c = await login();
    expect((await fetch(`${base}/me`, { headers: auth(c) })).status).toBe(200);
  });

  it('invalida tokens anteriores ao trocar a senha e recusa tokens legados sem versão', async () => {
    const old = await login();
    const wrong = await fetch(`${base}/change-password`, { method: 'POST', headers: auth(old), body: JSON.stringify({ currentPassword: 'senha-errada', newPassword: 'senha-nova-456' }) });
    expect(wrong.status).toBe(401);
    expect((await wrong.json() as { code: string }).code).not.toBe('SESSION_INVALID');
    expect((await fetch(`${base}/me`, { headers: auth(old) })).status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const legacy = jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: '1h' });
    expect((await fetch(`${base}/me`, { headers: auth(legacy) })).status).toBe(401);
    const changed = await fetch(`${base}/change-password`, { method: 'POST', headers: auth(old), body: JSON.stringify({ currentPassword: pass, newPassword: 'senha-nova-456' }) });
    expect(changed.status).toBe(200);
    expect((await fetch(`${base}/me`, { headers: auth(old) })).status).toBe(401);
    const next = await login('senha-nova-456');
    expect((await fetch(`${base}/me`, { headers: auth(next) })).status).toBe(200);
  });
});
