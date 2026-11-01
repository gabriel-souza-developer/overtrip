import dotenv from 'dotenv';
import type { SignOptions } from 'jsonwebtoken';

dotenv.config();

const INSECURE_JWT_SECRET = 'change-this-in-production';
const MIN_JWT_SECRET_LENGTH = 32;

export function buildConfig(env: NodeJS.ProcessEnv) {
  const nodeEnv = env.NODE_ENV || 'development';
  const jwtSecret = env.JWT_SECRET || INSECURE_JWT_SECRET;

  if (
    nodeEnv === 'production' &&
    (jwtSecret === INSECURE_JWT_SECRET || jwtSecret.length < MIN_JWT_SECRET_LENGTH)
  ) {
    throw new Error(
      `JWT_SECRET ausente ou fraco: em produção defina um segredo com pelo menos ${MIN_JWT_SECRET_LENGTH} caracteres.`
    );
  }

  // Atrás do Caddy (produção) o IP real vem em X-Forwarded-For: confia em 1 proxy.
  // TRUST_PROXY=0 desliga; fora de produção fica sempre desligado.
  const trustProxyHops = parseInt(env.TRUST_PROXY ?? '1', 10);
  const trustProxy = nodeEnv === 'production' && Number.isFinite(trustProxyHops) ? Math.max(0, trustProxyHops) : 0;

  // Em produção só escuta em loopback (o Caddy é a porta de entrada); HOST sobrescreve.
  const host = env.HOST || (nodeEnv === 'production' ? '127.0.0.1' : undefined);

  return {
    host,
    trustProxy,
    port: parseInt(env.PORT || '3001', 10),
    nodeEnv,
    jwtSecret,
    jwtExpiresIn: (env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
    corsOrigin: env.CORS_ORIGIN || 'http://localhost:3100',
  };
}

export const config = buildConfig(process.env);
