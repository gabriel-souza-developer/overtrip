import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSocialToken, encryptSocialToken, parseSocialTokenKey, type SocialTokenContext } from '../src/services/socialTokenCrypto.js';

const ctx: SocialTokenContext = { provider: 'instagram', accountId: 'conta-1', purpose: 'access_token' };

describe('criptografia de credenciais sociais', () => {
  it('aceita apenas chave base64 canônica de 32 bytes', () => {
    const key = randomBytes(32);
    expect(parseSocialTokenKey(key.toString('base64'))).toEqual(key);
    for (const invalid of [undefined, '', 'texto', randomBytes(16).toString('base64'), key.toString('base64').replace(/=$/, '')]) {
      expect(() => parseSocialTokenKey(invalid)).toThrow();
    }
  });

  it('cifra com nonce distinto e recupera apenas para o mesmo contexto', () => {
    const key = randomBytes(32);
    const one = encryptSocialToken('credencial-sintetica', key, ctx);
    const two = encryptSocialToken('credencial-sintetica', key, ctx);
    expect(one).not.toBe(two);
    expect(decryptSocialToken(one, key, ctx)).toBe('credencial-sintetica');
    for (const other of [{ ...ctx, accountId: 'conta-2' }, { ...ctx, provider: 'facebook' as const }, { ...ctx, purpose: 'refresh_token' as const }]) {
      expect(() => decryptSocialToken(one, key, other)).toThrow('Não foi possível acessar a credencial social.');
    }
  });

  it('rejeita chave errada, adulteração e versões ou formatos inválidos', () => {
    const key = randomBytes(32);
    const envelope = encryptSocialToken('token-secreto', key, ctx);
    expect(() => decryptSocialToken(envelope, randomBytes(32), ctx)).toThrow();
    const parts = envelope.split('.');
    const tag = Buffer.from(parts[2], 'base64url'); tag[0] ^= 1; parts[2] = tag.toString('base64url');
    for (const corrupted of [parts.join('.'), envelope.replace('v1.', 'v2.'), 'v1.abc.abc.abc', envelope + '.extra']) {
      expect(() => decryptSocialToken(corrupted, key, ctx)).toThrow('Não foi possível acessar a credencial social.');
    }
  });

  it('recusa tokens e contextos inválidos sem revelar seu conteúdo no erro', () => {
    const key = randomBytes(32);
    expect(() => encryptSocialToken('', key, ctx)).toThrow();
    expect(() => encryptSocialToken('x'.repeat(16385), key, ctx)).toThrow();
    expect(() => encryptSocialToken('token', key, { ...ctx, accountId: '' })).toThrow();
  });
});
