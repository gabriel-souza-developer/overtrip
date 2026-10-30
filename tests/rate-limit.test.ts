import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createRateLimiter } from '../src/middleware/rateLimit.js';

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
