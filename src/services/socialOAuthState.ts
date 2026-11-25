import { createHash, randomBytes } from 'node:crypto';

/** Estado efêmero do fluxo de autorização; não contém tokens da Meta. */
export interface OAuthStateRecord {
  stateHash: string;
  userId: string;
  sessionVersionMs: number;
  expiresAt: Date;
}

/**
 * `consume` DEVE ser uma operação atômica no repositório: consumir apenas
 * uma linha ainda não usada cujo hash, usuário e versão coincidam e cujo
 * expiresAt seja posterior a now. A versão da conta não identifica sessões
 * simultâneas: vincular também à sessão individual antes de expor rotas.
 */
export interface OAuthStateRepository {
  create(record: OAuthStateRecord): Promise<void>;
  consume(input: { stateHash: string; userId: string; sessionVersionMs: number; now: Date }): Promise<boolean>;
}

export type OAuthSession = { userId: string; sessionVersion: Date };
const STATE_TTL_MS = 10 * 60 * 1000;
const hash = (state: string) => createHash('sha256').update(state, 'utf8').digest('hex');

function validSession(session: OAuthSession): boolean {
  return typeof session.userId === 'string' && session.userId.length > 0 && session.userId.length <= 128 &&
    session.sessionVersion instanceof Date && Number.isSafeInteger(session.sessionVersion.getTime());
}

/** O valor retornado deve ser enviado somente ao provedor como parâmetro state. */
export async function createSocialOAuthState(repository: OAuthStateRepository, session: OAuthSession, now = new Date()): Promise<string> {
  if (!validSession(session) || !Number.isSafeInteger(now.getTime())) throw new Error('Sessão ou horário inválido');
  const state = randomBytes(32).toString('base64url');
  await repository.create({ stateHash: hash(state), userId: session.userId, sessionVersionMs: session.sessionVersion.getTime(), expiresAt: new Date(now.getTime() + STATE_TTL_MS) });
  return state;
}

/** Retorna falso para state inválido, expirado, repetido ou de outra versão de conta. */
export async function consumeSocialOAuthState(repository: OAuthStateRepository, state: unknown, session: OAuthSession, now = new Date()): Promise<boolean> {
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || !validSession(session) || !Number.isSafeInteger(now.getTime())) return false;
  return repository.consume({ stateHash: hash(state), userId: session.userId, sessionVersionMs: session.sessionVersion.getTime(), now });
}
