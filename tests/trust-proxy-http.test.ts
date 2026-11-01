import { describe, it, expect } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

// Confirma que, com trust proxy = 1, req.ip é o IP de X-Forwarded-For (usado pelo limite de login).
describe('trust proxy', () => {
  async function ipSeen(trust: number) {
    const app = express();
    if (trust) app.set('trust proxy', trust);
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    const r = await fetch(`http://127.0.0.1:${port}/ip`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    const body = (await r.json()) as { ip: string };
    server.close();
    return body.ip;
  }
  it('com proxy confiável usa o IP real', async () => expect(await ipSeen(1)).toBe('203.0.113.9'));
  it('sem proxy confiável ignora o cabeçalho', async () => expect(await ipSeen(0)).not.toBe('203.0.113.9'));
});
