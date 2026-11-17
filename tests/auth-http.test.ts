import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('POST /api/auth/login (HTTP real)', () => {
  it('aceita caixa mista em conta normalizada e preserva prioridade de conta legada exata', async () => {
    const passwordHash = await bcrypt.hash('senha-segura', 10);
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const normalized = `user-${suffix}@example.com`;
    const legacy = `USER-${suffix}@example.com`;
    const lower = await prisma.user.create({ data: { email: normalized, passwordHash, name: 'Conta normalizada', legacyAccess: false } });
    try {
      const login = (email: string) => fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'senha-segura' }),
      });
      const mixed = await login(legacy);
      expect(mixed.status).toBe(200);
      expect((await mixed.json()).user.id).toBe(lower.id);
      const upper = await prisma.user.create({ data: { email: legacy, passwordHash, name: 'Conta legada', legacyAccess: true } });
      try {
        const exact = await login(legacy);
        expect(exact.status).toBe(200);
        expect((await exact.json()).user.id).toBe(upper.id);
      } finally { await prisma.user.delete({ where: { id: upper.id } }); }
    } finally { await prisma.user.delete({ where: { id: lower.id } }); }
  });
  it('responde 401 para credenciais inexistentes e o servidor continua de pé', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nao-existe@example.com', password: 'senha-errada-123' }),
    });
    expect(res.status).toBe(401);
    expect(compare).toHaveBeenCalledOnce();

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    } finally { compare.mockRestore(); }
  });

  it('responde 400 para corpo inválido', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'isto-nao-e-email' }),
    });
    expect(res.status).toBe(400);
  });

  it('exige token nas rotas protegidas', async () => {
    const res = await fetch(`${baseUrl}/api/trips`);
    expect(res.status).toBe(401);
  });
});
