import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

let server: Server;
let base: string;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emails = [`login-a-${suffix}@example.test`, `login-b-${suffix}@example.test`];
const password = 'senha-ficticia-123';
const login = (email: string, submitted = password) => fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: submitted }),
});

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 4);
  await prisma.user.createMany({ data: emails.map(email => ({ email, passwordHash, role: 'editor' })) });
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('acesso compartilhado na mesma rede', () => {
  it('permite sucessos repetidos e limita falhas de uma conta sem bloquear outra', async () => {
    for (let i = 0; i < 12; i++) expect((await login(emails[0])).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await login(emails[1], 'senha-incorreta')).status).toBe(401);
    const limited = await login(emails[1].toUpperCase(), 'senha-incorreta');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await login(emails[0])).status).toBe(200);
  });
});
