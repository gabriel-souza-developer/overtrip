import { Request, Response, NextFunction } from 'express';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
}

const SWEEP_THRESHOLD = 1000;

export const createRateLimiter = ({ windowMs, max, now = Date.now }: RateLimiterOptions) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const current = now();

    if (hits.size > SWEEP_THRESHOLD) {
      for (const [key, entry] of hits) {
        if (entry.resetAt <= current) hits.delete(key);
      }
    }

    const key = req.ip ?? 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - current) / 1000)));
      res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
      return;
    }

    next();
  };
};

export const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
