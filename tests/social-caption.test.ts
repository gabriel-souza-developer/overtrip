import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAiRouter } from '../src/routes/aiRoutes.js';
import type { AiProvider } from '../src/services/aiTripDraft.js';

describe('sugestão de legenda', () => {
  it('exige administrador e valida entrada e saída sem expor erro do provedor', async () => {
    const generate = vi.fn().mockResolvedValue({ stopReason: 'end', object: { caption: 'Vamos viajar!' } });
    const provider: AiProvider = { name: 'gemini', defaultModel: 'test', generate };
    const app = express();
    app.use(express.json());
    app.use('/api/ai', createAiRouter({
      auth: (req, res, next) => {
        if (!req.headers.authorization) { res.sendStatus(401); return; }
        (req as any).user = { id: '1', role: req.headers.authorization === 'admin' ? 'admin' : 'editor' };
        next();
      },
      getClient: () => provider,
      limiter: (_req, _res, next) => next(),
    }));
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/social-caption`;
    const post = (body: unknown, authorization?: string) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });
    try {
      const input = { briefing: 'Trilha em Lucena', network: 'instagram' };
      expect((await post(input)).status).toBe(401);
      expect((await post(input, 'editor')).status).toBe(403);
      expect((await post({ ...input, network: 'outra' }, 'admin')).status).toBe(400);
      expect((await post({ ...input, briefing: 'a'.repeat(3001) }, 'admin')).status).toBe(413);
      const response = await post(input, 'admin');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ caption: 'Vamos viajar!' });
      expect(generate).toHaveBeenCalledOnce();
      expect(generate.mock.calls[0][0].userText).toContain('Trilha em Lucena');
      generate.mockResolvedValueOnce({ stopReason: 'end', object: { caption: '' } });
      expect((await post(input, 'admin')).status).toBe(502);
      generate.mockRejectedValueOnce(Object.assign(new Error('conteúdo ou chave privada'), { status: 500 }));
      const failed = await post(input, 'admin');
      expect(failed.status).toBe(502);
      expect(await failed.text()).not.toContain('chave privada');
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
