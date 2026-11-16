import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, membership: { findMany: vi.fn() } }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));

import app from '../src/platformApp.js';
import { generateToken } from '../src/middleware/auth.js';

let server: Server;
let url: string;
const user = { id: 'user-a', email: 'a@example.test', role: 'admin', updatedAt: new Date('2026-01-01T00:00:00Z') };

beforeAll(async () => {
  db.user.findUnique.mockResolvedValue(user);
  db.membership.findMany.mockResolvedValue([{ role: 'staff', organization: { id: 'org-a', name: 'Pousada', slug: 'pousada', niche: 'lodging' } }]);
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe('lista de empresas', () => {
  it('exige sessão e consulta somente vínculos ativos da identidade autenticada', async () => {
    expect((await fetch(url)).status).toBe(401);
    expect(db.membership.findMany).not.toHaveBeenCalled();
    const response = await fetch(`${url}?userId=user-b`, { headers: { Authorization: `Bearer ${generateToken(user)}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ organizations: [{ id: 'org-a', name: 'Pousada', slug: 'pousada', niche: 'lodging', role: 'staff' }] });
    expect(db.membership.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a', organization: { status: 'ACTIVE' } } }));
  });
});
