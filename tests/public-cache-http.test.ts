import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';

// O site revalida a cada visita (no-cache) e o ETag evita reenviar o JSON
// quando nada mudou: economia de banda sem servir dado velho do painel.
let server: Server;
let baseUrl: string;

const request = (path: string, headers: Record<string, string> = {}) => new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
  get(baseUrl + path, { headers }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers })); }).on('error', reject);
});

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

describe('cache das rotas públicas', () => {
  it.each(['/api/public/trips', '/api/public/gallery', '/api/public/destinations', '/api/public/settings/whatsapp'])('%s revalida com ETag e responde 304 sem mudanças', async (path) => {
    const first = await request(path);
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-cache');
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();
    expect((await request(path, { 'If-None-Match': etag })).status).toBe(304);
    expect((await request(path, { 'If-None-Match': 'W/"outro"' })).status).toBe(200);
  });
});
