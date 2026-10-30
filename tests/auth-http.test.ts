import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';

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
  it('responde 401 para credenciais inexistentes e o servidor continua de pé', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nao-existe@example.com', password: 'senha-errada-123' }),
    });
    expect(res.status).toBe(401);

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
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
