import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Contexto persistido junto à conta, não derivado de entrada não verificada. */
export interface SocialTokenContext {
  provider: 'facebook' | 'instagram';
  accountId: string;
  purpose: 'access_token' | 'refresh_token';
}

const VERSION = 'v1';
const MAX_TOKEN_BYTES = 16 * 1024;

/** Recebe base64 canônico de exatamente 32 bytes. Não aceita chaves fracas por fallback. */
export function parseSocialTokenKey(encoded: string | undefined): Buffer {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Chave de criptografia social inválida ou ausente.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('Chave de criptografia social inválida ou ausente.');
  return key;
}

function aad(context: SocialTokenContext): Buffer {
  if (!context || !['facebook', 'instagram'].includes(context.provider) || !['access_token', 'refresh_token'].includes(context.purpose) || typeof context.accountId !== 'string' || !context.accountId.trim() || context.accountId.length > 256) {
    throw new Error('Contexto de criptografia social inválido.');
  }
  return Buffer.from(JSON.stringify([VERSION, context.provider, context.accountId, context.purpose]), 'utf8');
}

function readPart(value: string, expectedLength?: number): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Formato inválido.');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value || (expectedLength !== undefined && decoded.length !== expectedLength)) throw new Error('Formato inválido.');
  return decoded;
}

/** Cifra um token com nonce aleatório de 96 bits e autentica conta, provedor e finalidade. */
export function encryptSocialToken(token: string, key: Buffer, context: SocialTokenContext): string {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Chave de criptografia social inválida ou ausente.');
  if (typeof token !== 'string' || !token || Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) throw new Error('Token social inválido.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [VERSION, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Falha fechada, sem revelar qual verificação falhou ou o conteúdo recebido. */
export function decryptSocialToken(envelope: string, key: Buffer, context: SocialTokenContext): string {
  try {
    if (!Buffer.isBuffer(key) || key.length !== 32 || typeof envelope !== 'string' || envelope.length > 24_000) throw new Error('Inválido');
    const parts = envelope.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Inválido');
    const nonce = readPart(parts[1], 12);
    const tag = readPart(parts[2], 16);
    const ciphertext = readPart(parts[3]);
    if (ciphertext.length > MAX_TOKEN_BYTES) throw new Error('Inválido');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Não foi possível acessar a credencial social.');
  }
}
