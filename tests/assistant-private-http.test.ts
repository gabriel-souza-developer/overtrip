import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAssistantPrivateApp } from '../src/assistantPrivateApp.js';
import { prisma } from '../src/lib/prisma.js';

const secret = 'ab'.repeat(32);
let server: Server; let url: string;
beforeAll(async () => { await new Promise<void>(resolve => { server = createAssistantPrivateApp(secret).listen(0, '127.0.0.1', resolve); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });
describe('catálogo privado do conector', () => {
  it('restringe acesso e não permite escrita', async () => {
    expect((await fetch(`${url}/catalog`)).status).toBe(401);
    expect((await fetch(`${url}/catalog`, { headers: { authorization: `Bearer ${'cd'.repeat(32)}` } })).status).toBe(401);
    const headers = { authorization: `Bearer ${secret}` };
    const response = await fetch(`${url}/catalog`, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Array.isArray((await response.json()).trips)).toBe(true);
    expect((await fetch(`${url}/knowledge`, { headers })).status).toBe(200);
    expect((await fetch(`${url}/catalog`, { method: 'POST', headers })).status).toBe(404);
  });
});
