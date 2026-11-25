/**
 * O e-mail de "esqueci minha senha" aponta para "#token=...", não
 * "?token=...": um fragmento nunca é enviado ao servidor (logs de acesso,
 * proxies, CDN) nem no cabeçalho Referer ao navegar para fora — uma query
 * string seria. Pura (recebe o hash em vez de ler window.location) para dar
 * para testar sem DOM.
 */
export function extractTokenFromHash(hash: string): string {
  const match = hash.match(/^#token=(.+)$/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}
