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

  return {
    port: parseInt(env.PORT || '3001', 10),
    nodeEnv,
    jwtSecret,
    jwtExpiresIn: (env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
    corsOrigin: env.CORS_ORIGIN || 'http://localhost:3000',
  };
}

export const config = buildConfig(process.env);
