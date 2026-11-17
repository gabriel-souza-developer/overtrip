import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let base: string;
const users: string[] = [];
async function account() {
  const user = await prisma.user.create({ data: { email: `pw-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`, passwordHash: await bcrypt.hash('senha-atual', 4), role: 'editor' } });
  users.push(user.id);
  return generateToken(user);
}
const change = (token: string, currentPassword: string, newPassword: string) => fetch(`${base}/api/auth/change-password`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ currentPassword, newPassword }),
});

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('proteções da troca de senha', () => {
  it('recusa senha curta, excesso de bytes UTF-8 e quebras sem encerrar a sessão', async () => {
    const token = await account();
    for (const password of ['curta', 'á'.repeat(37), 'senha\nvalida']) {
      expect((await change(token, 'senha-atual', password)).status).toBe(400);
    }
    expect((await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  });

  it('limita tentativas por conta, sem bloquear outra conta na mesma rede', async () => {
    const blocked = await account();
    const other = await account();
    for (let i = 0; i < 10; i++) expect((await change(blocked, 'senha-incorreta', 'senha-nova-123')).status).toBe(401);
    const limited = await change(blocked, 'senha-atual', 'senha-nova-123');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await change(other, 'senha-incorreta', 'senha-nova-123')).status).toBe(401);
  });
});
