export const IMAGE_SRC_MESSAGE =
  'Informe um link que comece com http:// ou https://, ou um caminho da pasta assets/ (ex.: assets/images/viagem/foto.jpg), ou envie a foto pelo painel.';

/** Prefixo público das imagens enviadas pelo painel (servidas pela API). */
export const MEDIA_PUBLIC_PREFIX = '/api/public/media/';

/** Só a versão principal gerada pelo servidor: 32 hex + .jpg ou .png. Nada além disso. */
const UPLOADED_MEDIA_SRC = /^\/api\/public\/media\/[0-9a-f]{32}\.(?:jpg|png)$/;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Imagem enviada pelo painel (e não um link externo ou arquivo de assets/). */
export function isUploadedMediaSrc(value: unknown): boolean {
  return typeof value === 'string' && UPLOADED_MEDIA_SRC.test(value);
}

/**
 * Origem de imagem aceita: http(s) absoluto, caminho relativo sob assets/
 * (com ou sem barra inicial) ou imagem enviada (/api/public/media/<hash>.jpg).
 * Recusa javascript:, data:, outros esquemas, '..', barra invertida e
 * qualquer outro caminho.
 */
export function isValidImageSrc(value: string): boolean {
  if (typeof value !== 'string' || value !== value.trim() || value === '') return false;
  if (CONTROL_CHARS.test(value) || value.includes('\\')) return false;
  if (isUploadedMediaSrc(value)) return true;

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

export const UPLOADED_ALT_MESSAGE = 'Descreva a foto enviada (texto alternativo obrigatório).';

/** Foto enviada pelo painel exige texto alternativo; as demais seguem a regra antiga. */
export function hasRequiredAlt(item: { src: string; alt?: string }): boolean {
  return !isUploadedMediaSrc(item.src) || (typeof item.alt === 'string' && item.alt.trim() !== '');
}
