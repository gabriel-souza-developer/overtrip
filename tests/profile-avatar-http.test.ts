import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let url: string;
beforeAll(async () => { await new Promise<void>(resolve => { server = app.listen(0, resolve); }); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/profile/avatar`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe('foto de perfil privada', () => {
  it('isola por usuário, reprocessa, altera e remove sem encerrar sessão', async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const a = await prisma.user.create({ data: { email: `avatar-a-${suffix}@example.com`, passwordHash: 'test' } });
    const b = await prisma.user.create({ data: { email: `avatar-b-${suffix}@example.com`, passwordHash: 'test' } });
    try {
      const aHeaders = { Authorization: `Bearer ${generateToken(a)}` };
      const bHeaders = { Authorization: `Bearer ${generateToken(b)}` };
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: bHeaders })).status).toBe(404);
      const image = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#c00' } }).png().toBuffer();
      const upload = await fetch(url, { method: 'PUT', headers: { ...aHeaders, 'Content-Type': 'image/png' }, body: image });
      expect(upload.status).toBe(204);
      const response = await fetch(url, { headers: aHeaders });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('content-type')).toContain('image/jpeg');
      expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width).toBe(256);
      expect((await fetch(url, { headers: bHeaders })).status).toBe(404);
      expect((await fetch(url, { method: 'PUT', headers: { ...aHeaders, 'Content-Type': 'image/png' }, body: 'not-an-image' })).status).toBe(415);
      expect((await fetch(url, { method: 'DELETE', headers: aHeaders })).status).toBe(204);
      expect((await fetch(url, { headers: aHeaders })).status).toBe(404);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    }
  });
});
