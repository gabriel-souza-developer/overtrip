const ABSOLUTE_SRC_PATTERN = /^(https?:\/\/|\/)/i;

/**
 * GalleryEntry/Trip 'images[].src' values are stored relative to the public
 * site root (same convention as index.html's assets/... paths), not to the
 * admin panel's Vite root. Rewrite them to a root-absolute path so <img>
 * resolves against the panel's own origin instead of 404ing.
 */
export function resolveAssetSrc(src: string): string {
  if (!src || ABSOLUTE_SRC_PATTERN.test(src)) {
    return src;
  }
  return `/${src}`;
}

/** Nome curto para identificar uma imagem sem expor o caminho técnico completo. */
export function imageSourceLabel(src: string): string {
  if (!src) return 'Foto adicionada';
  if (/^\/?api\/public\/media\//i.test(src)) return 'Foto enviada';

  let path = src.split(/[?#]/, 1)[0];
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname; } catch { return 'Foto adicionada'; }
  }
  const fileName = path.split('/').filter(Boolean).pop();
  if (!fileName) return 'Foto adicionada';
  try { return decodeURIComponent(fileName); } catch { return fileName; }
}
