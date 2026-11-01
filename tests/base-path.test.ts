import { describe, it, expect } from 'vitest';
import { routerBasename, brandUrl } from '../frontend/src/lib/basePath';
import { resolveAssetSrc } from '../frontend/src/lib/assetUrl';
import { buildConfig } from '../src/config.js';

const STRONG = 'x'.repeat(48);

describe('base do painel', () => {
  it('dev: raiz', () => {
    expect(routerBasename('/')).toBe('/');
    expect(brandUrl('a.png', '/')).toBe('/brand/a.png');
  });
  it('produção: /admin', () => {
    expect(routerBasename('/admin/')).toBe('/admin');
    expect(brandUrl('a.png', '/admin/')).toBe('/admin/brand/a.png');
  });
  it('imagens do site continuam apontando para a raiz', () => {
    expect(resolveAssetSrc('assets/images/x.webp')).toBe('/assets/images/x.webp');
  });
});

describe('trust proxy / CORS', () => {
  it('só liga em produção, 1 salto por padrão', () => {
    expect(buildConfig({ NODE_ENV: 'development' }).trustProxy).toBe(0);
    expect(buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG }).trustProxy).toBe(1);
  });
  it('TRUST_PROXY=0 desliga; fora de produção ignora', () => {
    expect(buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG, TRUST_PROXY: '0' }).trustProxy).toBe(0);
    expect(buildConfig({ NODE_ENV: 'development', TRUST_PROXY: '2' }).trustProxy).toBe(0);
  });
  it('CORS_ORIGIN vem do ambiente', () => {
    expect(buildConfig({ CORS_ORIGIN: 'https://overtrip.com.br' }).corsOrigin).toBe('https://overtrip.com.br');
  });
});

describe('HOST de escuta', () => {
  it('produção: 127.0.0.1 por padrão; HOST sobrescreve; dev sem host fixo', () => {
    expect(buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG }).host).toBe('127.0.0.1');
    expect(buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG, HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
    expect(buildConfig({ NODE_ENV: 'development' }).host).toBeUndefined();
  });
});
