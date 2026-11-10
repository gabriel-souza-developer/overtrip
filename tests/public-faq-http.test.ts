import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { PUBLIC_FAQ_KEY } from '../src/services/publicFaq.js';

let server: Server;
let base: string;
let adminToken: string;
let userToken: string;
let adminId: string;
let userId: string;
let originalFaqSetting: { value: string } | null = null;

beforeAll(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Este teste não pode ser executado em produção.');
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.endsWith('/prisma/test.db')) {
    throw new Error('Este teste exige o banco isolado prisma/test.db; não altera outros bancos.');
  }
  originalFaqSetting = await prisma.setting.findUnique({ where: { key: PUBLIC_FAQ_KEY }, select: { value: true } });
  await prisma.setting.deleteMany({ where: { key: PUBLIC_FAQ_KEY } });
  const tag = `public-faq-${Date.now()}`;
  const admin = await prisma.user.create({ data: { email: `${tag}-admin@example.test`, passwordHash: 'test', role: 'admin' } });
  const user = await prisma.user.create({ data: { email: `${tag}-user@example.test`, passwordHash: 'test', role: 'user' } });
  adminId = admin.id;
  userId = user.id;
  adminToken = generateToken(admin);
  userToken = generateToken(user);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: PUBLIC_FAQ_KEY } });
  if (originalFaqSetting) {
    await prisma.setting.create({ data: { key: PUBLIC_FAQ_KEY, value: originalFaqSetting.value } });
  }
  await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect();
});

describe('FAQ editável no painel e publicado no site', () => {
  const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  it('mantém o FAQ público somente leitura e exige administrador para editar', async () => {
    const publicResponse = await fetch(`${base}/public/faq`);
    expect(publicResponse.status).toBe(200);
    const initial = await publicResponse.json() as { entries: Array<{ question: string; answer: string }> };
    expect(initial.entries).toHaveLength(5);
    expect(initial.entries[0].question).toBe('Posso embarcar sozinho(a)?');
    expect((await fetch(`${base}/settings/public-faq`)).status).toBe(401);
    expect((await fetch(`${base}/settings/public-faq`, { headers: headers(userToken) })).status).toBe(403);
  });

  it('edita, ordena e publica as mesmas respostas sem expor metadados internos', async () => {
    const loaded = await fetch(`${base}/settings/public-faq`, { headers: headers(adminToken) });
    expect(loaded.status).toBe(200);
    const current = await loaded.json() as { version: number; entries: Array<{ question: string; answer: string }> };
    const entries = [
      { question: 'Como falar com a equipe?', answer: 'Chame a OVERTRIP pelo WhatsApp.' },
      ...current.entries,
    ];
    const saved = await fetch(`${base}/settings/public-faq`, {
      method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ expectedVersion: current.version, entries }),
    });
    expect(saved.status).toBe(200);
    const state = await saved.json() as { version: number; entries: unknown[]; updatedAt: string };
    expect(state.version).toBe(current.version + 1);
    expect(state.updatedAt).toBeTruthy();

    const publicFaq = await fetch(`${base}/public/faq`);
    expect(publicFaq.headers.get('cache-control')).toBe('no-store');
    expect(await publicFaq.json()).toEqual({ entries });

    const stale = await fetch(`${base}/settings/public-faq`, {
      method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ expectedVersion: current.version, entries }),
    });
    expect(stale.status).toBe(409);

    const concurrent = await Promise.all([
      fetch(`${base}/settings/public-faq`, { method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ expectedVersion: state.version, entries: [{ question: 'Versão A', answer: 'Resposta A' }] }) }),
      fetch(`${base}/settings/public-faq`, { method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ expectedVersion: state.version, entries: [{ question: 'Versão B', answer: 'Resposta B' }] }) }),
    ]);
    expect(concurrent.map(response => response.status).sort()).toEqual([200, 409]);
    const finalPublic = await (await fetch(`${base}/public/faq`)).json() as { entries: Array<{ question: string }> };
    expect(['Versão A', 'Versão B']).toContain(finalPublic.entries[0].question);
  });

  it('recusa FAQ vazio e respostas incompletas', async () => {
    const loaded = await fetch(`${base}/settings/public-faq`, { headers: headers(adminToken) });
    const current = await loaded.json() as { version: number };
    const empty = await fetch(`${base}/settings/public-faq`, {
      method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ expectedVersion: current.version, entries: [] }),
    });
    expect(empty.status).toBe(400);
    const incomplete = await fetch(`${base}/settings/public-faq`, {
      method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ expectedVersion: current.version, entries: [{ question: 'Pergunta sem resposta', answer: '' }] }),
    });
    expect(incomplete.status).toBe(400);
  });
});
