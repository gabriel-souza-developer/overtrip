import { createHash, timingSafeEqual } from 'node:crypto';

/** Credencial própria do conector: 32 bytes em hexadecimal, gerada fora do código.
 * Esta função não abre rotas e não autoriza ações de atendimento humano. */
export function authenticateAssistantService(configuredSecret: string | undefined, authorization: string | undefined): boolean {
  if (!configuredSecret || !/^[a-fA-F0-9]{64}$/.test(configuredSecret)) return false;
  if (!authorization || !/^Bearer [a-fA-F0-9]{64}$/.test(authorization)) return false;
  const expected = createHash('sha256').update(configuredSecret).digest();
  const supplied = createHash('sha256').update(authorization.slice(7)).digest();
  return timingSafeEqual(expected, supplied);
}
