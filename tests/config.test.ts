import { describe, it, expect } from 'vitest';
import { buildConfig } from '../src/config.js';

const STRONG = 'x'.repeat(48);

describe('buildConfig / JWT_SECRET', () => {
  it('em desenvolvimento aceita o segredo padrão', () => {
    expect(() => buildConfig({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('em produção recusa ausência de JWT_SECRET', () => {
    expect(() => buildConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('em produção recusa o segredo padrão inseguro', () => {
    expect(() =>
      buildConfig({ NODE_ENV: 'production', JWT_SECRET: 'change-this-in-production' })
    ).toThrow(/JWT_SECRET/);
  });

  it('em produção recusa segredo curto (< 32 caracteres)', () => {
    expect(() => buildConfig({ NODE_ENV: 'production', JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/);
  });

  it('em produção aceita segredo forte e não o inclui na mensagem de erro', () => {
    expect(buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG }).jwtSecret).toBe(STRONG);
    try {
      buildConfig({ NODE_ENV: 'production', JWT_SECRET: 'curto' });
    } catch (e) {
      expect((e as Error).message).not.toContain('curto');
    }
  });
});
