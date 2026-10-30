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
