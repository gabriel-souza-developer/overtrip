import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let base: string;
let adminToken: string;
let userToken: string;

beforeAll(async () => {
  await prisma.assistantKnowledgeVersion.deleteMany();
  const admin = await prisma.user.create({ data: { email: 'knowledge-http-admin@example.test', passwordHash: 'test', role: 'admin' } });
  const user = await prisma.user.create({ data: { email: 'knowledge-http-user@example.test', passwordHash: 'test', role: 'user' } });
  adminToken = generateToken(admin); userToken = generateToken(user);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/assistant-knowledge`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });

describe('gestão administrativa de conhecimento via HTTP', () => {
  const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  it('restringe leitura e aprovação a administradores e protege versões concorrentes', async () => {
    expect((await fetch(base)).status).toBe(401);
    expect((await fetch(base, { headers: headers(userToken) })).status).toBe(403);
    expect((await fetch(base, { method: 'POST', headers: headers(userToken), body: JSON.stringify({ expectedVersion: null, entries: [] }) })).status).toBe(403);
    expect(await (await fetch(base, { headers: headers(adminToken) })).json()).toBeNull();
    const body = { expectedVersion: null, entries: [{ question: 'Como reservar?', answer: 'Fale com a equipe.' }] };
    expect((await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ entries: [] }) })).status).toBe(400);
    const first = await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify(body) });
    expect(first.status).toBe(201);
    const v1 = await first.json() as { version: number; approvedById: string };
    expect((await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify(body) })).status).toBe(409);
    const second = await fetch(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ expectedVersion: v1.version, entries: [] }) });
    expect(second.status).toBe(201);
    expect((await (await fetch(`${base}/versions/${v1.version}`, { headers: headers(adminToken) })).json()).entries).toEqual(body.entries);
    expect((await (await fetch(base, { headers: headers(adminToken) })).json()).entries).toEqual([]);
    expect((await fetch(`${base}/versions/nope`, { headers: headers(adminToken) })).status).toBe(400);
    expect((await fetch(`${base}/versions/999999`, { headers: headers(adminToken) })).status).toBe(404);
    expect((await (await fetch(`${base}/versions`, { headers: headers(adminToken) })).json())).toHaveLength(2);
  });
});
