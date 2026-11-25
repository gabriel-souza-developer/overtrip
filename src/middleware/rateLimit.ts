import { Request, Response, NextFunction } from 'express';
import { createHmac, randomBytes } from 'node:crypto';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
  message?: string;
  /** Chave de contagem; padrão: IP. */
  keyOf?: (req: Request) => string;
}

const SWEEP_THRESHOLD = 1000;

export const createRateLimiter = ({ windowMs, max, now = Date.now, message = 'Muitas tentativas. Tente novamente mais tarde.', keyOf }: RateLimiterOptions) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const current = now();

    if (hits.size > SWEEP_THRESHOLD) {
      for (const [key, entry] of hits) {
        if (entry.resetAt <= current) hits.delete(key);
      }
    }

    const key = keyOf ? keyOf(req) : (req.ip ?? 'unknown');
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - current) / 1000)));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
};

/**
 * Reserva vagas enquanto uma tentativa está em andamento, para que pedidos
 * simultâneos não ultrapassem o limite de falhas. A chave é um HMAC efêmero
 * de IP e conta normalizada; e-mails não ficam em texto no mapa. O teto por
 * IP é separado e mais generoso, inclusive para requisições bem-sucedidas.
 * Ambos são locais a este processo e precisam de armazenamento compartilhado
 * numa implantação com várias instâncias.
 */
export const createLoginFailureLimiter = ({
  windowMs = 15 * 60 * 1000,
  maxFailures = 10,
  maxPerIp = 300,
  now = Date.now,
}: { windowMs?: number; maxFailures?: number; maxPerIp?: number; now?: () => number } = {}) => {
  const secret = randomBytes(32);
  const attempts = new Map<string, { failures: number; pending: number; resetAt: number }>();
  const ipLimiter = createRateLimiter({ windowMs, max: maxPerIp, now });

  return (req: Request, res: Response, next: NextFunction): void => {
    ipLimiter(req, res, () => {
      const current = now();
      if (attempts.size > SWEEP_THRESHOLD) {
        for (const [key, entry] of attempts) if (entry.resetAt <= current && entry.pending === 0) attempts.delete(key);
      }
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 512) : '';
      const key = createHmac('sha256', secret).update(JSON.stringify([req.ip ?? 'unknown', email])).digest('hex');
      let entry = attempts.get(key);
      if (!entry || entry.resetAt <= current) {
        entry = { failures: 0, pending: 0, resetAt: current + windowMs };
        attempts.set(key, entry);
      }
      if (entry.failures + entry.pending >= maxFailures) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - current) / 1000))));
        res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
        return;
      }
      entry.pending++;
      const reserved = entry;
      let settled = false;
      const settle = (completed: boolean) => {
        if (settled) return;
        settled = true;
        reserved.pending--;
        // Desconexões antes da resposta também contam, para não permitir
        // evasão deliberada fechando o socket antes do fim da verificação.
        if (!completed || res.statusCode < 200 || res.statusCode >= 300) reserved.failures++;
        if (reserved.pending === 0 && reserved.failures === 0 && attempts.get(key) === reserved) attempts.delete(key);
      };
      res.once('finish', () => settle(true));
      res.once('close', () => settle(false));
      next();
    });
  };
};

export const loginRateLimiter = createLoginFailureLimiter();

/**
 * "Esqueci minha senha": limite por IP (laxo) e, dentro dele, por e-mail
 * normalizado via HMAC efêmero (igual ao login: e-mail não fica em texto no
 * mapa). Mais estrito por conta do que por IP, para não permitir martelar
 * repetidamente a caixa de entrada de uma mesma pessoa.
 */
export const createForgotPasswordLimiter = ({
  windowMs = 15 * 60 * 1000,
  maxPerIp = 30,
  maxPerEmail = 5,
  now = Date.now,
}: { windowMs?: number; maxPerIp?: number; maxPerEmail?: number; now?: () => number } = {}) => {
  const secret = randomBytes(32);
  const ipLimiter = createRateLimiter({ windowMs, max: maxPerIp, now });
  const emailLimiter = createRateLimiter({
    windowMs,
    max: maxPerEmail,
    now,
    keyOf: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 512) : '';
      return createHmac('sha256', secret).update(email).digest('hex');
    },
  });
  return (req: Request, res: Response, next: NextFunction): void => {
    ipLimiter(req, res, () => emailLimiter(req, res, next));
  };
};

export const forgotPasswordLimiter = createForgotPasswordLimiter();

/**
 * Redefinir senha: o token em si já é alta entropia e de uso único; o
 * limite por IP só reduz tentativas automatizadas de adivinhação.
 */
export const resetPasswordLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
