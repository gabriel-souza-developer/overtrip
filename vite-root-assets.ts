import path from 'path';
import fs from 'fs';
import type { Plugin } from 'vite';

export const ASSETS_DIR = path.resolve(__dirname, 'assets');

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
};

export type AssetPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'malformed' | 'forbidden' };

/**
 * Decodes and bounds-checks a URL path requested under /assets, resolving it
 * to an absolute path inside ASSETS_DIR. Pure (no fs access) so the decoding
 * and traversal checks can be unit-tested without a running server. Returns
 * a tagged result instead of throwing/null so the caller can tell malformed
 * input (400) apart from a valid-but-out-of-bounds path (403).
 */
export function resolveRequestedAssetPath(urlPath: string): AssetPathResult {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (decoded.includes('\0')) {
    return { ok: false, reason: 'malformed' };
  }
  const filePath = path.join(ASSETS_DIR, decoded);
  if (filePath !== ASSETS_DIR && !filePath.startsWith(ASSETS_DIR + path.sep)) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, path: filePath };
}

// GalleryEntry/Trip 'images[].src' store paths relative to the public site
// root (assets/...), matching index.html's convention — not to this panel's
// Vite root (frontend/). Serve the repo-root assets/ folder under /assets in
// dev so those same paths resolve, without exposing the rest of the repo
// (.env, .git, etc).
//
// Production is NOT handled here: there is no express.static/route on the
// backend serving /assets, so whether '/assets/...' resolves in production
// depends on an infrastructure decision that hasn't been made yet (e.g.
// hosting the panel build under the same document root as the static site).
export function serveRootAssets(): Plugin {
  return {
    name: 'serve-root-assets',
    configureServer(server) {
      server.middlewares.use('/assets', (req, res, next) => {
        const rawPath = (req.url || '').split('?')[0];
        const result = resolveRequestedAssetPath(rawPath);
        if (!result.ok) {
          res.statusCode = result.reason === 'malformed' ? 400 : 403;
          res.end(result.reason === 'malformed' ? 'Bad Request' : 'Forbidden');
          return;
        }
        fs.stat(result.path, (err, stats) => {
          if (err || !stats.isFile()) {
            next();
            return;
          }
          const ext = path.extname(result.path).toLowerCase();
          res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
          fs.createReadStream(result.path).pipe(res);
        });
      });
    },
  };
}
