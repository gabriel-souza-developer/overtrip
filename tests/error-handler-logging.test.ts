import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError, errorHandler } from '../src/middleware/errorHandler';

const fakeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response;
};

const run = (err: Error) => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  errorHandler(err, {} as Request, fakeRes(), vi.fn());
  return JSON.stringify(spy.mock.calls);
};

afterEach(() => vi.restoreAllMocks());

describe('registro de erros', () => {
  it('registra o stack de erros inesperados para diagnóstico de 500', () => {
    const logged = run(new Error('falha interna xyz'));
    expect(logged).toContain('falha interna xyz');
    expect(logged).toContain('error-handler-logging.test');
  });

  it('não registra valores de validação nem mensagens de AppError', () => {
    const zodError = z.object({ phone: z.string().email() }).safeParse({ phone: '83999990000' }).error!;
    expect(run(zodError)).not.toContain('83999990000');
    expect(run(AppError.badRequest('cpf 123.456.789-00'))).not.toContain('123.456.789-00');
  });

  it('não registra trechos do corpo em erros do body-parser', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token in JSON: {"email":"a@b.com"'), { type: 'entity.parse.failed' });
    expect(run(parseError)).not.toContain('a@b.com');
  });

  it('não registra mensagens de erros do Prisma, que podem conter argumentos da consulta', () => {
    const prismaLike = new Error('Invalid `prisma.lead.create()` invocation: { phone: "83999990000" }');
    prismaLike.name = 'PrismaClientValidationError';
    expect(run(prismaLike)).not.toContain('83999990000');
  });
});
