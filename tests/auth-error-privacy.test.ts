import type { NextFunction, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { authenticate, generateToken, type AuthRequest } from '../src/middleware/auth.js';

describe('privacidade de erros na autenticação', () => {
  afterEach(() => vi.restoreAllMocks());

  it('não serializa o erro do banco quando a consulta da sessão falha', async () => {
    const privateValue = 'private-auth-query-fixture';
    vi.spyOn(prisma.user, 'findUnique').mockRejectedValue(new Error(privateValue));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const updatedAt = new Date();
    const token = generateToken({ id: 'auth-fixture', email: 'fixture@example.test', role: 'admin', updatedAt });
    const req = {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      app: { locals: {} },
    } as unknown as AuthRequest;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

    await authenticate(req, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(log).toHaveBeenCalledWith('Falha interna ao autenticar a sessão.');
    expect(JSON.stringify(log.mock.calls)).not.toContain(privateValue);
  });
});
