import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';

const prisma = new PrismaClient();
let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let entryId: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const user = await prisma.user.create({
    data: { email: `test:gallery-src-http:${Date.now()}@example.com`, passwordHash: 'unused', role: 'admin' },
  });
  userId = user.id;
  token = generateToken({ id: user.id, email: user.email, role: user.role });
  const entry = await prisma.galleryEntry.create({
    data: {
      title: 'Gallery src test',
      date: new Date('2026-01-01T00:00:00-03:00'),
      dateDisplay: 'Jan 2026',
      orderIndex: 0,
      description: 'd',
      images: JSON.stringify([{ src: 'assets/images/a.jpg', alt: 'a' }]),
      storedIdentity: `gallery-src-http-test:${Date.now()}`,
    },
  });
  entryId = entry.id;
});

afterAll(async () => {
  await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: 'gallery-src-http-test:' } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const put = (images: unknown) =>
  fetch(`${baseUrl}/api/gallery/${entryId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });

describe('PUT /api/gallery/:id com origem de imagem', () => {
  it('aceita src relativo sob assets/', async () => {
    const res = await put([{ src: 'assets/images/coqueirinho-conde-pb/coqueirinho-pb-vista-aerea.jpg', alt: 'Vista aérea' }]);
    expect(res.status).toBe(200);
  });

  it('recusa javascript:', async () => {
    const res = await put([{ src: 'javascript:alert(1)', alt: 'x' }]);
    expect(res.status).toBe(400);
  });
});
