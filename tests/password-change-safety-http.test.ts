import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { hashToken } from '../src/services/passwordResetService.js';

let server: Server;
let base: string;
const users: string[] = [];
async function accountWithId() {
  const user = await prisma.user.create({ data: { email: `pw-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`, passwordHash: await bcrypt.hash('senha-atual', 4), role: 'editor' } });
  users.push(user.id);
  return { userId: user.id, token: generateToken(user) };
}
async function account() {
  return (await accountWithId()).token;
}
const change = (token: string, currentPassword: string, newPassword: string) => fetch(`${base}/api/auth/change-password`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ currentPassword, newPassword }),
});
const resetPassword = (resetToken: string, newPassword: string) => fetch(`${base}/api/auth/reset-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: resetToken, newPassword }),
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
  it('exige troca no primeiro acesso antes de acessar dados, rejeita reutilização e invalida a sessão inicial', async () => {
    const user = await prisma.user.create({ data: { email: `first-${Date.now()}-${Math.random()}@example.test`, passwordHash: await bcrypt.hash('overtrip', 4), role: 'admin', legacyAccess: true, mustChangePassword: true } });
    users.push(user.id);
    const login = (password: string) => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    const first = await login('overtrip');
    expect(first.status).toBe(200);
    expect((await first.json()).user.mustChangePassword).toBe(true);
    const token = generateToken(user);
    const headers = { Authorization: `Bearer ${token}` };
    const blocked = await fetch(`${base}/api/trips`, { headers });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');
    for (const path of ['/api/organizations', '/api/profile/avatar']) {
      const response = await fetch(`${base}${path}`, { headers });
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    const me = await fetch(`${base}/api/auth/me`, { headers });
    expect((await me.json()).mustChangePassword).toBe(true);
    expect((await change(token, 'overtrip', 'overtrip')).status).toBe(400);
    expect((await change(token, 'overtrip', 'senha pessoal com espacos')).status).toBe(200);
    expect((await fetch(`${base}/api/trips`, { headers })).status).toBe(401);
    expect((await login('overtrip')).status).toBe(401);
    const again = await login('senha pessoal com espacos');
    expect(again.status).toBe(200);
    expect((await again.json()).user.mustChangePassword).toBe(false);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const newHeaders = { Authorization: `Bearer ${generateToken(updated)}` };
    expect((await fetch(`${base}/api/organizations`, { headers: newHeaders })).status).toBe(200);
    // Sem foto cadastrada é 404, mostrando que passou pela autenticação.
    expect((await fetch(`${base}/api/profile/avatar`, { headers: newHeaders })).status).toBe(404);
  });
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

  it('troca de senha autenticada invalida qualquer token de "esqueci minha senha" emitido antes dela', async () => {
    const { userId, token } = await accountWithId();
    const beforeChange = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const rawResetToken = 'token-emitido-antes-da-troca-' + Math.random().toString(16).slice(2);
    await prisma.passwordResetToken.create({
      data: {
        userId, tokenHash: hashToken(rawResetToken), expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        issuedForUpdatedAt: beforeChange.updatedAt,
      },
    });

    expect((await change(token, 'senha-atual', 'senha-trocada-123')).status).toBe(200);

    // O token de reset emitido ANTES da troca não pode mais redefinir a senha.
    const attempt = await resetPassword(rawResetToken, 'senha-via-token-velho-456');
    expect(attempt.status).toBe(400);
    expect((await attempt.json()).code).toBe('INVALID_RESET_TOKEN');

    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawResetToken) } });
    expect(row?.usedAt).toBeTruthy();
  });
});
