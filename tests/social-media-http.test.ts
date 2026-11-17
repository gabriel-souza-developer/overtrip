import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server | undefined, base = '', admin = '', editor = '', dir = '', mediaId = '', postId = '';
const emails = [`social-media-admin-${randomUUID()}@example.test`, `social-media-editor-${randomUUID()}@example.test`];
const expectedDb = `file:${resolve(process.cwd(), 'prisma/test.db')}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => {
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL !== expectedDb) throw new Error('Exige banco de teste isolado.');
  dir = await mkdtemp(join(tmpdir(), 'overtrip-private-media-')); process.env.SOCIAL_MEDIA_DIR = dir;
  const a = await prisma.user.create({ data: { legacyAccess: true, email: emails[0], passwordHash: 'x', role: 'admin' } });
  const e = await prisma.user.create({ data: { legacyAccess: true, email: emails[1], passwordHash: 'x', role: 'editor' } });
  admin = generateToken(a); editor = generateToken(e);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (process.env.DATABASE_URL === expectedDb && process.env.NODE_ENV !== 'production') {
    if (postId) await prisma.socialPost.deleteMany({ where: { id: postId } });
    if (mediaId) await prisma.socialMedia.deleteMany({ where: { id: mediaId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  }
  await prisma.$disconnect();
  if (dir.startsWith(join(tmpdir(), 'overtrip-private-media-'))) await rm(dir, { recursive: true, force: true });
  delete process.env.SOCIAL_MEDIA_DIR;
});
describe('mídia social privada', () => {
  it('rejeita diretórios compartilhados ou com permissão insegura sem modificá-los', async () => {
    const data = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
    const send = () => fetch(`${base}/social-media`, { method: 'POST', headers: { ...auth(admin), 'Content-Type': 'image/png' }, body: data });
    const shared = tmpdir();
    const before = (await stat(shared)).mode & 0o7777;
    process.env.SOCIAL_MEDIA_DIR = shared;
    expect((await send()).status).toBe(503);
    expect((await stat(shared)).mode & 0o7777).toBe(before);
    process.env.SOCIAL_MEDIA_DIR = dir;
    await chmod(dir, 0o755);
    expect((await send()).status).toBe(503);
    expect((await stat(dir)).mode & 0o7777).toBe(0o755);
    await chmod(dir, 0o700);
  });
  it('exige administrador, guarda arquivo privado e vincula revisão à imagem', async () => {
    const data = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#ff8800' } }).png().toBuffer();
    const send = (token: string) => fetch(`${base}/social-media`, { method: 'POST', headers: { ...auth(token), 'Content-Type': 'image/png' }, body: data });
    expect((await send(editor)).status).toBe(403);
    const response = await send(admin); expect(response.status).toBe(201);
    const item = await response.json() as { id: string }; mediaId = item.id;
    const db = await prisma.socialMedia.findUniqueOrThrow({ where: { id: mediaId } });
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(dir, db.storageKey))).mode & 0o777).toBe(0o600);
    expect((await fetch(`${base}/social-media/${mediaId}`)).status).toBe(401);
    const get = await fetch(`${base}/social-media/${mediaId}`, { headers: auth(admin) });
    expect(get.status).toBe(200); expect(get.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await get.arrayBuffer())).toEqual(await readFile(join(dir, db.storageKey)));
    const jsonHeaders = { ...auth(admin), 'Content-Type': 'application/json' };
    const created = await fetch(`${base}/social-posts`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ title: 'Arte', variants: [{ platform: 'INSTAGRAM', caption: 'Olá', socialMediaId: mediaId }] }) });
    expect(created.status).toBe(201); const post = await created.json() as { id: string; version: number }; postId = post.id;
    let approved = await fetch(`${base}/social-posts/${postId}/approve`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ version: post.version }) }); expect(approved.status).toBe(200);
    const after = await approved.json() as { version: number };
    const changed = await fetch(`${base}/social-posts/${postId}`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ title: 'Arte', version: after.version, variants: [{ platform: 'INSTAGRAM', caption: 'Olá', socialMediaId: mediaId }] }) });
    expect((await changed.json() as { approvedAt: string | null }).approvedAt).toBeNull();
    await unlink(join(dir, db.storageKey));
    approved = await fetch(`${base}/social-posts/${postId}/approve`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ version: after.version + 1 }) }); expect(approved.status).toBe(400);
  });
});
