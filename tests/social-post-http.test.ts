import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

let server: Server | undefined, base: string, adminToken: string, userToken: string;
const suffix = randomUUID();
const emails = [`social-admin-${suffix}@example.test`, `social-user-${suffix}@example.test`];
const testDatabase = `file:${resolve(process.cwd(), 'prisma/test.db')}`;
let postId: string | undefined;
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const variants = [{ platform: 'INSTAGRAM', caption: 'Uma viagem especial' }, { platform: 'FACEBOOK', caption: 'Vamos viajar!' }];
const request = (path: string, method: string, body: unknown, token = adminToken) => fetch(`${base}${path}`, { method, headers: headers(token), body: JSON.stringify(body) });
beforeAll(async () => {
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL !== testDatabase) throw new Error('Este teste exige o banco isolado prisma/test.db.');
  const admin = await prisma.user.create({ data: { legacyAccess: true, email: emails[0], passwordHash: 'x', role: 'admin' } });
  const user = await prisma.user.create({ data: { legacyAccess: true, email: emails[1], passwordHash: 'x', role: 'user' } });
  adminToken = generateToken(admin); userToken = generateToken(user);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/social-posts`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL === testDatabase) {
    if (postId) await prisma.socialPost.deleteMany({ where: { id: postId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  }
  await prisma.$disconnect();
});

describe('rascunhos sociais', () => {
  it('exige administrador, valida e protege a revisão contra alterações concorrentes', async () => {
    expect((await fetch(base)).status).toBe(401);
    expect((await fetch(base, { headers: headers(userToken) })).status).toBe(403);
    expect((await request('', 'POST', { title: 'Teste', variants: [{ platform: 'X', caption: 'abc' }] })).status).toBe(400);
    expect((await request('', 'POST', { title: 'Teste', variants: [variants[0], variants[0]] })).status).toBe(400);
    const created = await request('', 'POST', { title: ' Roteiro ', variants });
    expect(created.status).toBe(201); expect(created.headers.get('cache-control')).toBe('no-store');
    const item = await created.json() as { id: string; title: string; version: number; approvedAt: string | null };
    postId = item.id;
    expect(item.title).toBe('Roteiro'); expect(item.version).toBe(1); expect(item.approvedAt).toBeNull();
    const approved = await request(`/${item.id}/approve`, 'POST', { version: item.version });
    expect(approved.status).toBe(200);
    const revised = await approved.json() as typeof item;
    expect(revised.approvedAt).toBeTruthy(); expect(revised.version).toBe(2);
    expect((await request(`/${item.id}`, 'PUT', { title: 'Antigo', variants, version: 1 })).status).toBe(409);
    const edit = await request(`/${item.id}`, 'PUT', { title: 'Novo', variants: [{ platform: 'INSTAGRAM', caption: '' }], version: 2 });
    expect(edit.status).toBe(200);
    const edited = await edit.json() as typeof item;
    expect(edited.approvedAt).toBeNull(); expect(edited.version).toBe(3);
    expect((await request(`/${item.id}/approve`, 'POST', { version: 3 })).status).toBe(400);
    const list = await (await fetch(base, { headers: headers(adminToken) })).json() as { data: { id: string }[] };
    expect(list.data.map(row => row.id)).toContain(item.id);
    expect((await request(`/${item.id}`, 'DELETE', { version: 2 })).status).toBe(409);
    expect((await request(`/${item.id}`, 'DELETE', {})).status).toBe(400);
    expect((await request(`/${item.id}`, 'DELETE', { version: 3 })).status).toBe(204);
    expect(await prisma.socialPostVariant.count({ where: { postId: item.id } })).toBe(0);
  });
});
