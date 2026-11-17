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

  // Site/assistente OVERTRIP só mostram viagens sem organização (dado legado,
  // organizationId null) por padrão. Para liberar viagens de uma organização
  // específica (ex.: backfill controlado), liste IDs exatos em
  // PUBLIC_SITE_ORGANIZATION_IDS (separados por vírgula). Nunca aceita um
  // atalho para "todas": a ausência da variável preserva o comportamento legado.
  const rawPublicSiteOrganizationIds = (env.PUBLIC_SITE_ORGANIZATION_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (rawPublicSiteOrganizationIds.some((id) => id === '*' || id.toLowerCase() === 'all')) {
    throw new Error(
      'PUBLIC_SITE_ORGANIZATION_IDS não aceita "*" nem "all": liste os IDs exatos das organizações autorizadas a aparecer no site público.'
    );
  }
  const publicSiteOrganizationIds = Array.from(new Set(rawPublicSiteOrganizationIds));

  // Escopo próprio da OPERAÇÃO legada (/api/trips e rotas relacionadas: documentos,
  // dashboard, associações de visitas/galeria) — independente de PUBLIC_SITE_ORGANIZATION_IDS,
  // que só autoriza o que aparece no site/assistente público. Por padrão o operador
  // legado só lista/edita viagens sem organização (organizationId null). Depois de
  // aplicar scripts/backfill-tourism-organization.ts atribuindo as viagens da OVERTRIP
  // a UMA organização, configure LEGACY_TOURISM_ORGANIZATION_ID com esse ID exato
  // (um único ID, não uma lista) para o painel legado continuar operando os mesmos
  // dados. Nunca "*"/"all".
  const rawLegacyTourismOrganizationId = (env.LEGACY_TOURISM_ORGANIZATION_ID || '').trim();
  if (rawLegacyTourismOrganizationId && (rawLegacyTourismOrganizationId === '*' || rawLegacyTourismOrganizationId.toLowerCase() === 'all')) {
    throw new Error(
      'LEGACY_TOURISM_ORGANIZATION_ID não aceita "*" nem "all": informe o ID exato de uma única organização.'
    );
  }
  if (rawLegacyTourismOrganizationId.includes(',')) {
    throw new Error('LEGACY_TOURISM_ORGANIZATION_ID aceita um único ID de organização, não uma lista separada por vírgula.');
  }
  const legacyTourismOrganizationId = rawLegacyTourismOrganizationId || null;

  return {
    host,
    trustProxy,
    port: parseInt(env.PORT || '3001', 10),
    nodeEnv,
    jwtSecret,
    jwtExpiresIn: (env.JWT_EXPIRES_IN || '2h') as SignOptions['expiresIn'],
    corsOrigin: env.CORS_ORIGIN || 'http://localhost:3100',
    publicSiteOrganizationIds,
    legacyTourismOrganizationId,
    // Gravado pelo deploy/monitor-health.sh; lido pelo painel em /api/system/health.
    healthStatusFile: env.HEALTH_STATUS_FILE || '/var/lib/overtrip/health/status.json',
    healthHistoryFile: env.HEALTH_HISTORY_FILE || '/var/lib/overtrip/health/history.jsonl',
  };
}

export const config = buildConfig(process.env);
