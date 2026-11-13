import { Router, raw, type Request, type Response } from 'express';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = Router();
const contentType = ['application/csp-report', 'application/reports+json', 'application/json'];
const perIpLimit = createRateLimiter({ windowMs: 60_000, max: 60 });
const globalLimit = createRateLimiter({ windowMs: 60_000, max: 600, keyOf: () => 'all' });

function safeLocation(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const input = value.trim().slice(0, 1024);
  if (!input) return undefined;
  if (['inline', 'eval', 'wasm-eval', 'self'].includes(input)) return input;
  try {
    const url = new URL(input, 'https://overtrip.com.br');
    return `${url.origin}${url.pathname}`.slice(0, 256);
  } catch {
    return input.replace(/[?#].*$/, '').slice(0, 256);
  }
}

function shortText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function reportBodies(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.slice(0, 10).flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const body = (entry as Record<string, unknown>).body;
      return body && typeof body === 'object' && !Array.isArray(body) ? [body as Record<string, unknown>] : [];
    });
  }
  const object = value as Record<string, unknown>;
  const legacy = object['csp-report'];
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) return [legacy as Record<string, unknown>];
  return [object];
}

function logReport(report: Record<string, unknown>): void {
  const lineNumber = report['line-number'] ?? report.lineNumber;
  const sanitized = {
    document: safeLocation(report['document-uri'] ?? report.documentURL),
    blocked: safeLocation(report['blocked-uri'] ?? report.blockedURL),
    directive: shortText(report['effective-directive'] ?? report['violated-directive'] ?? report.effectiveDirective, 100),
    source: safeLocation(report['source-file'] ?? report.sourceFile),
    line: typeof lineNumber === 'number' && Number.isInteger(lineNumber) && lineNumber >= 0 ? lineNumber : undefined,
  };
  if (sanitized.blocked || sanitized.directive) console.info('[csp-report]', JSON.stringify(sanitized));
}

router.post('/', globalLimit, perIpLimit, raw({ type: contentType, limit: '16kb' }), (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: 'Relatório CSP inválido' });
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Relatório CSP inválido' });
    return;
  }
  const reports = reportBodies(payload);
  if (!reports.length) {
    res.status(400).json({ error: 'Relatório CSP inválido' });
    return;
  }
  for (const report of reports) logReport(report);
  res.status(204).end();
});

export default router;
