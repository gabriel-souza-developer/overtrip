import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { createLoginFailureLimiter, createRateLimiter, createForgotPasswordLimiter } from '../src/middleware/rateLimit.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res as unknown as Response & typeof res;
}
const reqFrom = (ip: string) => ({ ip }) as Request;

describe('createRateLimiter', () => {
  it('libera até o máximo e bloqueia a tentativa seguinte com 429 e Retry-After', () => {
    const now = 1_000;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: () => now });
    const next = vi.fn();

    for (let i = 0; i < 3; i++) limiter(reqFrom('1.1.1.1'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(3);

    const blocked = mockRes();
    limiter(reqFrom('1.1.1.1'), blocked, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('conta por IP: outro IP não é afetado', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => 0 });
    const next = vi.fn();
    limiter(reqFrom('1.1.1.1'), mockRes(), next);
    limiter(reqFrom('2.2.2.2'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('libera de novo depois que a janela expira', () => {
    let now = 0;
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1, now: () => now });
    const next = vi.fn();
    limiter(reqFrom('1.1.1.1'), mockRes(), next);
    limiter(reqFrom('1.1.1.1'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    now = 1_001;
    limiter(reqFrom('1.1.1.1'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe('limite de falhas de login', () => {
  const request = (email: string, ip = '1.2.3.4') => ({ ip, body: { email } }) as Request;
  const response = () => Object.assign(new EventEmitter(), {
    statusCode: 200, headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(_body: unknown) { return this; },
  });
  const call = (limiter: ReturnType<typeof createLoginFailureLimiter>, email: string, status?: number) => {
    const res = response(); const next = vi.fn();
    limiter(request(email), res as unknown as Response, next);
    if (next.mock.calls.length && status !== undefined) { res.statusCode = status; res.emit('finish'); res.emit('close'); }
    return { res, next };
  };

  it('não conta sucessos como falhas e mantém cotas separadas por conta no mesmo IP', () => {
    const limiter = createLoginFailureLimiter({ maxFailures: 2, maxPerIp: 50 });
    for (let i = 0; i < 15; i++) expect(call(limiter, 'ok@example.test', 200).next).toHaveBeenCalledOnce();
    call(limiter, 'PESSOA@example.test', 401);
    call(limiter, 'pessoa@example.test', 401);
    expect(call(limiter, 'Pessoa@example.test').res.statusCode).toBe(429);
    expect(call(limiter, 'outra@example.test', 200).next).toHaveBeenCalledOnce();
  });

  it('reserva tentativas simultâneas e conta conexões interrompidas', () => {
    const limiter = createLoginFailureLimiter({ maxFailures: 2, maxPerIp: 20 });
    const first = call(limiter, 'a@example.test');
    const second = call(limiter, 'a@example.test');
    expect(call(limiter, 'a@example.test').res.statusCode).toBe(429);
    first.res.statusCode = 200; first.res.emit('finish'); first.res.emit('close');
    const third = call(limiter, 'a@example.test');
    expect(third.next).toHaveBeenCalledOnce();
    second.res.emit('close');
    third.res.statusCode = 401; third.res.emit('finish');
    expect(call(limiter, 'a@example.test').res.statusCode).toBe(429);
  });

  it('aplica teto independente por IP e libera após expirar a janela', () => {
    let clock = 0;
    const limiter = createLoginFailureLimiter({ windowMs: 1000, maxFailures: 2, maxPerIp: 3, now: () => clock });
    for (let i = 0; i < 3; i++) expect(call(limiter, `conta${i}@example.test`, 200).next).toHaveBeenCalledOnce();
    expect(call(limiter, 'outra@example.test').res.statusCode).toBe(429);
    clock = 1001;
    expect(call(limiter, 'outra@example.test', 200).next).toHaveBeenCalledOnce();
  });
});

describe('limite de "esqueci minha senha"', () => {
  const reqFromEmail = (ip: string, email: string) => ({ ip, body: { email } }) as Request;

  it('bloqueia depois do teto por e-mail, mesmo com outro IP', () => {
    const limiter = createForgotPasswordLimiter({ maxPerIp: 50, maxPerEmail: 2 });
    const next = vi.fn();
    limiter(reqFromEmail('1.1.1.1', 'alguem@example.test'), mockRes(), next);
    limiter(reqFromEmail('2.2.2.2', 'ALGUEM@example.test'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
    const blocked = mockRes();
    limiter(reqFromEmail('3.3.3.3', 'alguem@example.test'), blocked, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(blocked.statusCode).toBe(429);
  });

  it('bloqueia depois do teto por IP, mesmo com e-mails diferentes', () => {
    const limiter = createForgotPasswordLimiter({ maxPerIp: 2, maxPerEmail: 50 });
    const next = vi.fn();
    limiter(reqFromEmail('9.9.9.9', 'a@example.test'), mockRes(), next);
    limiter(reqFromEmail('9.9.9.9', 'b@example.test'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
    const blocked = mockRes();
    limiter(reqFromEmail('9.9.9.9', 'c@example.test'), blocked, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(blocked.statusCode).toBe(429);
  });

  it('não afeta contas em IPs diferentes dentro do teto de cada um', () => {
    const limiter = createForgotPasswordLimiter({ maxPerIp: 50, maxPerEmail: 1 });
    const next = vi.fn();
    limiter(reqFromEmail('1.1.1.1', 'x@example.test'), mockRes(), next);
    limiter(reqFromEmail('2.2.2.2', 'y@example.test'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
