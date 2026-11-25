import { config } from '../config.js';

export type SendEmailResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'network_error' | 'send_failed'; status?: number };

/** Verdadeiro só quando BREVO_API_KEY e BREVO_SENDER_EMAIL estão definidos. */
export function isBrevoConfigured(): boolean {
  return Boolean(config.brevoApiKey && config.brevoSenderEmail);
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Sem teto, uma Brevo lenta/travada deixaria a requisição pendente
// indefinidamente — o que, além de desperdiçar conexões, alargaria sem
// limite a janela de tempo que distingue uma conta existente (chamada real)
// de uma inexistente (nunca chama). Ver MIN_REQUEST_DURATION_MS em
// passwordResetService.ts para o piso correspondente do outro lado.
const SEND_TIMEOUT_MS = 8000;

/**
 * Envia o e-mail de redefinição de senha via API transacional da Brevo
 * (serviço gratuito opcional, configurado por variáveis de ambiente).
 * Nunca lança: o chamador decide o que fazer com cada motivo de falha.
 * `fetchFn` é injetável para testes não fazerem chamada de rede real.
 */
export async function sendPasswordResetEmail(
  params: { to: string; resetUrl: string },
  deps: { fetchFn?: typeof fetch; timeoutMs?: number } = {}
): Promise<SendEmailResult> {
  if (!isBrevoConfigured()) return { ok: false, reason: 'not_configured' };
  const fetchFn = deps.fetchFn ?? fetch;
  const timeoutSignal = AbortSignal.timeout(deps.timeoutMs ?? SEND_TIMEOUT_MS);

  try {
    const res = await fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: timeoutSignal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': config.brevoApiKey as string,
      },
      body: JSON.stringify({
        sender: { email: config.brevoSenderEmail, name: config.brevoSenderName },
        to: [{ email: params.to }],
        subject: 'Redefinição de senha — OVERTRIP',
        htmlContent:
          `<p>Recebemos uma solicitação para redefinir a senha da sua conta OVERTRIP.</p>` +
          `<p><a href="${escapeHtml(params.resetUrl)}">Clique aqui para criar uma nova senha</a>. O link expira em pouco tempo.</p>` +
          `<p>Se você não fez esta solicitação, ignore este e-mail: sua senha continua a mesma.</p>`,
        textContent:
          `Recebemos uma solicitação para redefinir a senha da sua conta OVERTRIP.\n\n` +
          `Acesse para criar uma nova senha: ${params.resetUrl}\n\n` +
          `O link expira em pouco tempo. Se você não fez esta solicitação, ignore este e-mail.`,
      }),
    });
    if (!res.ok) return { ok: false, reason: 'send_failed', status: res.status };
    return { ok: true };
  } catch {
    // Cobre tanto erro de rede quanto o abort do timeout acima.
    return { ok: false, reason: 'network_error' };
  }
}
