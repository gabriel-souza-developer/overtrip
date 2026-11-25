import { describe, it, expect } from 'vitest';
import { buildConfig } from '../src/config.js';

const STRONG = 'x'.repeat(48);
const PROD_RESET_ENV = { CORS_ORIGIN: 'https://overtrip.com.br', PASSWORD_RESET_URL_BASE: 'https://overtrip.com.br/admin' };
const BREVO_ON = { BREVO_API_KEY: 'fake-key', BREVO_SENDER_EMAIL: 'nao-responda@overtrip.com.br' };

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
    expect(buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG, ...PROD_RESET_ENV }).jwtSecret).toBe(STRONG);
    try {
      buildConfig({ NODE_ENV: 'production', JWT_SECRET: 'curto', ...PROD_RESET_ENV });
    } catch (e) {
      expect((e as Error).message).not.toContain('curto');
    }
  });
});

describe('buildConfig / PASSWORD_RESET_URL_BASE', () => {
  it('fora de produção, sem a variável, cai no próprio CORS_ORIGIN', () => {
    const result = buildConfig({ NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:3100' });
    expect(result.passwordResetUrlBase).toBe('http://localhost:3100');
  });

  it('em produção, com Brevo configurado (recuperação ativada), exige a variável (o painel é publicado em /admin, corsOrigin por si só gera link quebrado)', () => {
    expect(() => buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG, CORS_ORIGIN: 'https://overtrip.com.br', ...BREVO_ON }))
      .toThrow(/PASSWORD_RESET_URL_BASE/);
  });

  it('em produção, SEM Brevo configurado, não exige a variável: a API sobe normalmente e a recuperação de senha fica indisponível (já tratado por isBrevoConfigured)', () => {
    expect(() => buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG, CORS_ORIGIN: 'https://overtrip.com.br' }))
      .not.toThrow();
    const result = buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG, CORS_ORIGIN: 'https://overtrip.com.br' });
    expect(result.brevoApiKey).toBeNull();
    expect(result.passwordResetUrlBase).toBe('https://overtrip.com.br');
  });

  it('em produção, com Brevo configurado mas PASSWORD_RESET_URL_BASE já presente, não falha', () => {
    expect(() => buildConfig({ NODE_ENV: 'production', JWT_SECRET: STRONG, ...PROD_RESET_ENV, ...BREVO_ON })).not.toThrow();
  });

  it('em produção, exige HTTPS', () => {
    expect(() => buildConfig({
      NODE_ENV: 'production', JWT_SECRET: STRONG,
      CORS_ORIGIN: 'http://overtrip.com.br', PASSWORD_RESET_URL_BASE: 'http://overtrip.com.br/admin',
    })).toThrow(/HTTPS/);
  });

  it('em produção, exige que a origem combine com CORS_ORIGIN (senão a checagem de Origin das rotas de auth rejeitaria a própria página)', () => {
    expect(() => buildConfig({
      NODE_ENV: 'production', JWT_SECRET: STRONG,
      CORS_ORIGIN: 'https://overtrip.com.br', PASSWORD_RESET_URL_BASE: 'https://outro-dominio.example/admin',
    })).toThrow(/não combina/);
  });

  it('recusa URL inválida', () => {
    expect(() => buildConfig({
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:3100', PASSWORD_RESET_URL_BASE: 'isto-nao-e-url',
    })).toThrow(/URL absoluta válida/);
  });

  it('aceita com /admin e remove barra final duplicada, sem alterar o caminho', () => {
    const result = buildConfig({
      NODE_ENV: 'production', JWT_SECRET: STRONG,
      CORS_ORIGIN: 'https://overtrip.com.br', PASSWORD_RESET_URL_BASE: 'https://overtrip.com.br/admin/',
    });
    expect(result.passwordResetUrlBase).toBe('https://overtrip.com.br/admin');
  });

  it('fora de produção, se configurada, ainda valida a origem contra CORS_ORIGIN', () => {
    expect(() => buildConfig({
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:3100', PASSWORD_RESET_URL_BASE: 'http://localhost:9999/admin',
    })).toThrow(/não combina/);
  });

  it('recusa query string', () => {
    expect(() => buildConfig({
      NODE_ENV: 'production', JWT_SECRET: STRONG,
      CORS_ORIGIN: 'https://overtrip.com.br', PASSWORD_RESET_URL_BASE: 'https://overtrip.com.br/admin?foo=bar',
    })).toThrow(/query string/);
  });

  it('recusa fragmento', () => {
    expect(() => buildConfig({
      NODE_ENV: 'production', JWT_SECRET: STRONG,
      CORS_ORIGIN: 'https://overtrip.com.br', PASSWORD_RESET_URL_BASE: 'https://overtrip.com.br/admin#secao',
    })).toThrow(/fragmento/);
  });

  it('em produção, recusa caminho diferente de /admin (documentado em vite.config.ts "base")', () => {
    expect(() => buildConfig({
      NODE_ENV: 'production', JWT_SECRET: STRONG,
      CORS_ORIGIN: 'https://overtrip.com.br', PASSWORD_RESET_URL_BASE: 'https://overtrip.com.br',
    })).toThrow(/\/admin/);
    expect(() => buildConfig({
      NODE_ENV: 'production', JWT_SECRET: STRONG,
      CORS_ORIGIN: 'https://overtrip.com.br', PASSWORD_RESET_URL_BASE: 'https://overtrip.com.br/outro',
    })).toThrow(/\/admin/);
  });

  it('fora de produção, recusa qualquer subcaminho (painel é servido na raiz fora de produção)', () => {
    expect(() => buildConfig({
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:3100', PASSWORD_RESET_URL_BASE: 'http://localhost:3100/admin',
    })).toThrow(/raiz/);
  });

  it('fora de produção, aceita a raiz explícita', () => {
    const result = buildConfig({
      NODE_ENV: 'development',
      CORS_ORIGIN: 'http://localhost:3100', PASSWORD_RESET_URL_BASE: 'http://localhost:3100/',
    });
    expect(result.passwordResetUrlBase).toBe('http://localhost:3100');
  });
});

describe('buildConfig / PUBLIC_SITE_ORGANIZATION_IDS', () => {
  it('sem a variável, não autoriza nenhuma organização (preserva o site/assistente com dado legado)', () => {
    expect(buildConfig({ NODE_ENV: 'development' }).publicSiteOrganizationIds).toEqual([]);
  });

  it('string vazia também não autoriza nenhuma organização', () => {
    expect(buildConfig({ NODE_ENV: 'development', PUBLIC_SITE_ORGANIZATION_IDS: '' }).publicSiteOrganizationIds).toEqual([]);
  });

  it('aceita lista separada por vírgula, removendo espaços e duplicados', () => {
    const result = buildConfig({ NODE_ENV: 'development', PUBLIC_SITE_ORGANIZATION_IDS: ' org-a, org-b ,org-a,,' }).publicSiteOrganizationIds;
    expect(result).toEqual(['org-a', 'org-b']);
  });

  it('recusa "*" e "all" como atalho para todas as organizações', () => {
    expect(() => buildConfig({ NODE_ENV: 'development', PUBLIC_SITE_ORGANIZATION_IDS: '*' })).toThrow(/PUBLIC_SITE_ORGANIZATION_IDS/);
    expect(() => buildConfig({ NODE_ENV: 'development', PUBLIC_SITE_ORGANIZATION_IDS: 'org-a,all' })).toThrow(/PUBLIC_SITE_ORGANIZATION_IDS/);
    expect(() => buildConfig({ NODE_ENV: 'development', PUBLIC_SITE_ORGANIZATION_IDS: 'ALL' })).toThrow(/PUBLIC_SITE_ORGANIZATION_IDS/);
  });
});

describe('buildConfig / LEGACY_TOURISM_ORGANIZATION_ID', () => {
  it('sem a variável, o escopo legado é só organizationId null (comportamento inalterado)', () => {
    expect(buildConfig({ NODE_ENV: 'development' }).legacyTourismOrganizationId).toBeNull();
  });

  it('string vazia também mantém o escopo legado padrão', () => {
    expect(buildConfig({ NODE_ENV: 'development', LEGACY_TOURISM_ORGANIZATION_ID: '' }).legacyTourismOrganizationId).toBeNull();
  });

  it('aceita um único ID, sem espaços', () => {
    expect(buildConfig({ NODE_ENV: 'development', LEGACY_TOURISM_ORGANIZATION_ID: ' org-overtrip ' }).legacyTourismOrganizationId).toBe('org-overtrip');
  });

  it('recusa "*" e "all" como atalho para todas as organizações', () => {
    expect(() => buildConfig({ NODE_ENV: 'development', LEGACY_TOURISM_ORGANIZATION_ID: '*' })).toThrow(/LEGACY_TOURISM_ORGANIZATION_ID/);
    expect(() => buildConfig({ NODE_ENV: 'development', LEGACY_TOURISM_ORGANIZATION_ID: 'ALL' })).toThrow(/LEGACY_TOURISM_ORGANIZATION_ID/);
  });

  it('recusa uma lista separada por vírgula: aceita um único ID, não vários', () => {
    expect(() => buildConfig({ NODE_ENV: 'development', LEGACY_TOURISM_ORGANIZATION_ID: 'org-a,org-b' })).toThrow(/LEGACY_TOURISM_ORGANIZATION_ID/);
  });

  it('é independente de PUBLIC_SITE_ORGANIZATION_IDS (variáveis e propósitos distintos)', () => {
    const result = buildConfig({
      NODE_ENV: 'development',
      LEGACY_TOURISM_ORGANIZATION_ID: 'org-legado',
      PUBLIC_SITE_ORGANIZATION_IDS: 'org-publico',
    });
    expect(result.legacyTourismOrganizationId).toBe('org-legado');
    expect(result.publicSiteOrganizationIds).toEqual(['org-publico']);
  });
});
