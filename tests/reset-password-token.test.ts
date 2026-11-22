import { describe, it, expect } from 'vitest';
import { extractTokenFromHash } from '../frontend/src/lib/resetPasswordToken';

describe('extractTokenFromHash', () => {
  it('extrai o token de "#token=..."', () => {
    expect(extractTokenFromHash('#token=abc123')).toBe('abc123');
  });

  it('decodifica caracteres especiais (ex.: base64url com "%3D" etc. já tratados pelo encodeURIComponent do emissor)', () => {
    expect(extractTokenFromHash('#token=' + encodeURIComponent('a+b/c=d'))).toBe('a+b/c=d');
  });

  it('retorna vazio sem hash', () => {
    expect(extractTokenFromHash('')).toBe('');
  });

  it('trata codificação inválida como link inválido', () => {
    expect(extractTokenFromHash('#token=%')).toBe('');
  });

  it('retorna vazio para um hash que não é "#token=..." (ex.: âncora comum ou query antiga por engano)', () => {
    expect(extractTokenFromHash('#secao')).toBe('');
    expect(extractTokenFromHash('#token')).toBe('');
  });
});
