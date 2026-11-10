/** Regras independentes de HTTP para imagens enviadas pelo painel. */
export const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
/** Lado máximo aceito na entrada; acima disso a imagem é recusada antes de decodificar. */
export const MEDIA_MAX_DIMENSION = 8000;
/** Limite de pixels (proteção contra decompression bomb): ~40 MP. */
export const MEDIA_MAX_PIXELS = 40_000_000;

export type ImageKind = 'jpeg' | 'png' | 'webp';

const DECLARED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream']);

export class MediaUploadError extends Error {
  constructor(public status: 400 | 413 | 415, message: string) {
    super(message);
  }
}

/** Identifica o formato pelos bytes iniciais (bytes mágicos), nunca pelo nome ou Content-Type. */
export function detectImageKind(body: Buffer): ImageKind | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'jpeg';
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (body.length >= 12 && body.subarray(0, 4).toString('latin1') === 'RIFF' && body.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/**
 * O Content-Type é só uma declaração do cliente: exigimos que seja de imagem
 * aceita e, sobretudo, que os bytes sejam de JPEG, PNG ou WebP.
 */
export function assertImageUpload(contentType: string | undefined, body: unknown, maxBytes = MEDIA_MAX_BYTES): { body: Buffer; kind: ImageKind } {
  const declared = contentType?.split(';', 1)[0].trim().toLowerCase() ?? '';
  if (!DECLARED_TYPES.has(declared)) {
    throw new MediaUploadError(415, 'Envie uma imagem JPEG, PNG ou WebP.');
  }
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new MediaUploadError(400, 'A imagem está vazia.');
  }
  if (body.length > maxBytes) {
    throw new MediaUploadError(413, `A imagem ultrapassa o limite de ${Math.floor(maxBytes / 1024 / 1024)} MiB.`);
  }
  const kind = detectImageKind(body);
  if (!kind) throw new MediaUploadError(415, 'O arquivo não é uma imagem JPEG, PNG ou WebP válida.');
  return { body, kind };
}
