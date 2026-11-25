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

  const corsOrigin = env.CORS_ORIGIN || 'http://localhost:3100';

  // Integração opcional e gratuita com a API transacional da Brevo, só para
  // o e-mail de "esqueci minha senha". Sem BREVO_API_KEY e BREVO_SENDER_EMAIL,
  // o serviço fica indisponível e o fluxo responde isso com clareza — nunca
  // finge que enviou o e-mail.
  const brevoApiKey = env.BREVO_API_KEY || null;
  const brevoSenderEmail = env.BREVO_SENDER_EMAIL || null;
  const brevoSenderName = env.BREVO_SENDER_NAME || 'OVERTRIP';

  // URL fixa usada para montar o link de redefinição enviado por e-mail.
  // Vem só da configuração do servidor, nunca do Host/Origin da requisição
  // (evita envenenamento de link por Host forjado). Em produção o painel é
  // publicado em /admin (ver vite.config.ts "base"), então corsOrigin por si
  // só gera um link quebrado: exige a variável explícita, com o subcaminho
  // (ex.: https://overtrip.com.br/admin). Só exige isso quando a recuperação
  // de senha está de fato ativada (Brevo configurado) — sem Brevo, a rota já
  // fica indisponível por conta própria (ver isBrevoConfigured em
  // brevoClient.ts), e exigir a URL aqui também derrubaria a API inteira na
  // publicação só por essa variável não ter sido definida ainda. Fora de
  // produção (painel servido na raiz em dev) cai no próprio corsOrigin, sem
  // exigir a variável.
  const brevoConfigured = Boolean(brevoApiKey && brevoSenderEmail);
  const rawPasswordResetUrlBase = (env.PASSWORD_RESET_URL_BASE || '').trim();
  if (nodeEnv === 'production' && brevoConfigured && !rawPasswordResetUrlBase) {
    throw new Error(
      'PASSWORD_RESET_URL_BASE ausente: BREVO_API_KEY/BREVO_SENDER_EMAIL estão configurados (recuperação de senha ativada), então em produção também é preciso configurar a URL completa do painel, incluindo o subcaminho /admin (ex.: https://overtrip.com.br/admin). Sem isso, o link de redefinição de senha do e-mail fica quebrado.'
    );
  }
  // Subcaminho documentado do painel (.env.example, vite.config.ts "base":
  // command === 'build' ? '/admin/' : '/'). Produto de empresa única, uma
  // única publicação: não há necessidade de tornar isto configurável.
  const PANEL_BASE_PATH = '/admin';
  let passwordResetUrlBase = corsOrigin;
  if (rawPasswordResetUrlBase) {
    if (nodeEnv === 'production' && !rawPasswordResetUrlBase.startsWith('https://')) {
      throw new Error('PASSWORD_RESET_URL_BASE deve usar HTTPS em produção.');
    }
    let parsed: URL;
    try {
      parsed = new URL(rawPasswordResetUrlBase);
    } catch {
      throw new Error('PASSWORD_RESET_URL_BASE precisa ser uma URL absoluta válida (ex.: https://overtrip.com.br/admin).');
    }
    // Sem query string nem fragmento: o link final já acrescenta seu
    // próprio caminho (/redefinir-senha) e fragmento (#token=...) — um
    // destes aqui produziria uma URL ambígua ou quebrada ao concatenar.
    if (parsed.search || parsed.hash) {
      throw new Error(
        'PASSWORD_RESET_URL_BASE não pode ter query string nem fragmento (ex.: https://overtrip.com.br/admin, sem "?" ou "#"): o link de redefinição já acrescenta seu próprio caminho e fragmento.'
      );
    }
    // A página do link é servida nessa origem e chama as rotas de auth com
    // fetch relativo: a origem enviada no cabeçalho Origin só passa pela
    // checagem de requireSameOrigin (authRoutes.ts) se bater com corsOrigin.
    if (parsed.origin !== corsOrigin) {
      throw new Error(
        `PASSWORD_RESET_URL_BASE (origem ${parsed.origin}) não combina com CORS_ORIGIN (${corsOrigin}): a página do link de redefinição precisa ser servida na mesma origem autorizada pelas rotas de autenticação.`
      );
    }
    // Caminho precisa bater com o documentado para o ambiente: em produção
    // o painel só existe em /admin (ver PANEL_BASE_PATH); fora de produção
    // ele é servido na raiz. Pega um valor fora desses dois nunca é um
    // acerto por coincidência — é configuração errada que quebraria o link.
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const expectedPathname = nodeEnv === 'production' ? PANEL_BASE_PATH : '/';
    if (pathname !== expectedPathname) {
      throw new Error(
        nodeEnv === 'production'
          ? `PASSWORD_RESET_URL_BASE precisa apontar para o subcaminho ${PANEL_BASE_PATH} (ex.: https://overtrip.com.br${PANEL_BASE_PATH}), igual ao build do painel (ver vite.config.ts "base"); recebido "${pathname}".`
          : `Fora de produção o painel é servido na raiz: PASSWORD_RESET_URL_BASE não pode ter um subcaminho (recebido "${pathname}").`
      );
    }
    passwordResetUrlBase = pathname === '/' ? parsed.origin : `${parsed.origin}${pathname}`;
  }

  const parsedResetTtl = parseInt(env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? '30', 10);
  const passwordResetTokenTtlMinutes = Number.isFinite(parsedResetTtl) && parsedResetTtl > 0 ? parsedResetTtl : 30;

  return {
    host,
    trustProxy,
    port: parseInt(env.PORT || '3001', 10),
    nodeEnv,
    jwtSecret,
    jwtExpiresIn: (env.JWT_EXPIRES_IN || '2h') as SignOptions['expiresIn'],
    corsOrigin,
    publicSiteOrganizationIds,
    legacyTourismOrganizationId,
    brevoApiKey,
    brevoSenderEmail,
    brevoSenderName,
    passwordResetUrlBase,
    passwordResetTokenTtlMinutes,
    // Gravado pelo deploy/monitor-health.sh; lido pelo painel em /api/system/health.
    healthStatusFile: env.HEALTH_STATUS_FILE || '/var/lib/overtrip/health/status.json',
    healthHistoryFile: env.HEALTH_HISTORY_FILE || '/var/lib/overtrip/health/history.jsonl',
  };
}

export const config = buildConfig(process.env);
