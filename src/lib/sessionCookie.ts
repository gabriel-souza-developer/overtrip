import type { Request } from 'express';
import { config } from '../config.js';

/** Cada aplicação usa um cookie distinto, inclusive quando compartilham host. */
export function sessionCookieName(req: Request): string {
  const name = req.app.locals.sessionNamespace === 'platform' ? 'overtrip_platform_session' : 'overtrip_session';
  return config.nodeEnv === 'production' ? `__Host-${name}` : name;
}
