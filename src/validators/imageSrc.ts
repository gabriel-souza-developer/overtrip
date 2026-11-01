export const IMAGE_SRC_MESSAGE =
  'Informe um link que comece com http:// ou https://, ou um caminho da pasta assets/ (ex.: assets/images/viagem/foto.jpg).';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Origem de imagem aceita: http(s) absoluto, ou caminho relativo sob assets/
 * (com ou sem barra inicial). Recusa javascript:, data:, outros esquemas,
 * '..', barra invertida e qualquer outro caminho.
 */
export function isValidImageSrc(value: string): boolean {
  if (typeof value !== 'string' || value !== value.trim() || value === '') return false;
  if (CONTROL_CHARS.test(value) || value.includes('\\')) return false;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
    } catch {
      return false;
    }
  }

  const path = value.startsWith('/') ? value.slice(1) : value;
  if (!path.startsWith('assets/') || path === 'assets/') return false;
  if (path.includes('%') || path.includes(':')) return false;
  return path.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}
