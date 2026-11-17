import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    legacyAccess?: boolean;
    sessionVersion: Date;
  };
}

const sessionCookieName = () => config.nodeEnv === 'production'
  ? '__Host-overtrip_session'
  : 'overtrip_session';

const cookieValue = (req: Request, name: string): string | null => {
  const prefix = `${name}=`;
  const item = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!item) return null;
  try { return decodeURIComponent(item.slice(prefix.length)); } catch { return null; }
};

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  options: { optional?: boolean } = {},
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const cookieToken = cookieValue(req, sessionCookieName());
    const token = bearerToken || cookieToken;

    if (!token) {
      if (options.optional) { next(); return; }
      res.status(401).json({ error: 'Token de autenticação não fornecido', code: 'SESSION_INVALID' });
      return;
    }

    // Cookies são enviados automaticamente pelo navegador. Para operações que
    // alteram dados, aceite-os somente quando a origem coincide com o painel.
    if (!bearerToken && cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('origin') !== config.corsOrigin) {
        res.status(403).json({ error: 'Origem não autorizada para esta operação.' });
        return;
      }
    }
    
    let decoded: { id: string; email: string; role: string; sv?: number };
    try {
      decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as typeof decoded;
    } catch (err) {
      if (options.optional) { next(); return; }
      res.status(401).json({ error: 'Token inválido ou expirado', code: 'SESSION_INVALID' });
      return;
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, legacyAccess: true, updatedAt: true },
    });

    if (!user || !Number.isSafeInteger(decoded.sv) || decoded.sv !== user.updatedAt.getTime()) {
      if (options.optional) { next(); return; }
      res.status(401).json({ error: 'Sessão inválida ou encerrada. Entre novamente.', code: 'SESSION_INVALID' });
      return;
    }

    req.user = { id: user.id, email: user.email, role: user.role, legacyAccess: user.legacyAccess, sessionVersion: user.updatedAt };
    next();
  } catch {
    // Driver errors can include user identifiers and query arguments.
    console.error('Erro interno de autenticação.');
    res.status(500).json({ error: 'Erro interno de autenticação' });
  }
};

/** Acesso explícito ao domínio global legado; role e vínculo não o concedem. */
export const requireLegacyAccess = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) { res.status(401).json({ error: 'Não autenticado', code: 'SESSION_INVALID' }); return; }
  if (req.user.legacyAccess !== true) { res.status(403).json({ error: 'Acesso ao painel legado não autorizado.', code: 'LEGACY_ACCESS_DENIED' }); return; }
  next();
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Acesso negado: permissão insuficiente' });
      return;
    }

    next();
  };
};

export const generateToken = (user: { id: string; email: string; role: string; updatedAt: Date }): string => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, sv: user.updatedAt.getTime() },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' }
  );
};

export const verifyToken = (token: string): { id: string; email: string; role: string } | null => {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { id: string; email: string; role: string };
  } catch {
    return null;
  }
};
