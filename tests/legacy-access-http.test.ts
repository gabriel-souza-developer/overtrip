import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

let server: Server;
let base: string;
let legacyId: string;
let newId: string;
let legacyToken: string;
let newToken: string;
const password = 'senha-ficticia-123';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 4);
  const legacy = await prisma.user.create({ data: { email: 'legacy-gate-old@example.test', passwordHash, role: 'admin', legacyAccess: true } });
  const newer = await prisma.user.create({ data: { email: 'legacy-gate-new@example.test', passwordHash, role: 'admin' } });
  legacyId = legacy.id; newId = newer.id;
  legacyToken = generateToken(legacy); newToken = generateToken(newer);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.user.deleteMany({ where: { id: { in: [legacyId, newId].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe('proteção explícita do turismo legado', () => {
  it('nega todos os pontos legados para nova conta mesmo com papel admin', async () => {
    const routes = ['/api/trips', '/api/trips/ficticia/documents', '/api/media', '/api/social-media', '/api/leads', '/api/reservations', '/api/social-posts', '/api/system', '/api/visits', '/api/gallery', '/api/dashboard', '/api/settings', '/api/assistant-knowledge', '/api/ai'];
    for (const path of routes) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const response = await fetch(`${base}${path}`, { method, headers: bearer(newToken) });
        expect(response.status, `${method} ${path}`).toBe(403);
        expect((await response.json() as { code: string }).code).toBe('LEGACY_ACCESS_DENIED');
      }
    }
  });
  it('preserva o acesso das contas legadas e revalida a permissão na sessão existente', async () => {
    expect((await fetch(`${base}/api/trips`, { headers: bearer(legacyToken) })).status).toBe(200);
    // Raw update leaves session version untouched and proves a fresh lookup.
    await prisma.$executeRaw`UPDATE "User" SET "legacyAccess" = false WHERE id = ${legacyId}`;
    expect((await fetch(`${base}/api/trips`, { headers: bearer(legacyToken) })).status).toBe(403);
    await prisma.$executeRaw`UPDATE "User" SET "legacyAccess" = true WHERE id = ${legacyId}`;
  });
  it('mantém login, empresas, CORS e site público disponíveis', async () => {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: config.corsOrigin }, body: JSON.stringify({ email: 'legacy-gate-new@example.test', password }) });
    expect(login.status).toBe(200);
    expect((await login.json() as { user: { legacyAccess: boolean } }).user.legacyAccess).toBe(false);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const meResponse = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
    expect(meResponse.status).toBe(200);
    expect((await meResponse.json() as { legacyAccess: boolean }).legacyAccess).toBe(false);
    expect((await fetch(`${base}/api/organizations`, { headers: { Cookie: cookie } })).status).toBe(200);
    expect((await fetch(`${base}/api/media`, { method: 'POST', headers: { Cookie: cookie, Origin: config.corsOrigin } })).status).toBe(403);
    expect((await fetch(`${base}/api/trips`, { method: 'OPTIONS', headers: { Origin: config.corsOrigin, 'Access-Control-Request-Method': 'GET' } })).status).toBe(204);
    expect((await fetch(`${base}/api/public/trips`)).status).toBe(200);
  });

  it('expõe legacyAccess=true em /me apenas para a conta legada', async () => {
    const me = await fetch(`${base}/api/auth/me`, { headers: bearer(legacyToken) });
    expect(me.status).toBe(200);
    expect((await me.json() as { legacyAccess: boolean }).legacyAccess).toBe(true);
  });
  it('nega acesso quando a consulta de autenticação falha', async () => {
    const spy = vi.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('private-fixture@example.test'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await fetch(`${base}/api/trips`, { headers: bearer(newToken) })).status).toBe(500);
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-fixture@example.test');
    } finally { spy.mockRestore(); log.mockRestore(); }
  });
});
