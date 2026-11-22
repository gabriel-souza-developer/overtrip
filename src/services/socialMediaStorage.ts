import { lstat, mkdir, realpath } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { AppError } from '../middleware/errorHandler.js';

// Extraído de socialMediaRoutes.ts (rota legada) para ser reaproveitado,
// sem duplicação, pela rota de mídia social por empresa
// (organizationSocialMediaRoutes.ts): ambas gravam no MESMO diretório
// privado — a titularidade por organizationId é decidida em cada consulta
// ao SocialMedia, nunca por uma pasta separada.
const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);

export async function socialMediaDirectory(): Promise<string> {
  const configured = process.env.SOCIAL_MEDIA_DIR || (process.env.NODE_ENV === 'production' ? '/var/lib/overtrip/social-media' : path.join(homedir(), '.local/share/overtrip-dev/social-media'));
  if (!path.isAbsolute(configured)) throw new AppError(503, 'Armazenamento privado indisponível.');
  const requested = path.resolve(configured);
  const prohibited = ['/', '/tmp', '/var', '/var/lib', '/var/lib/overtrip', '/srv', '/srv/overtrip', '/srv/overtrip-public', '/var/lib/overtrip/uploads', path.resolve(tmpdir()), path.resolve(homedir())];
  if (prohibited.includes(requested)) throw new AppError(503, 'Armazenamento privado deve ser um diretório dedicado.');
  await mkdir(configured, { recursive: true, mode: 0o700 });
  const info = await lstat(configured);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o7777) !== 0o700 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
    throw new AppError(503, 'Diretório privado deve pertencer ao serviço e ter permissão 700.');
  }
  const dir = await realpath(configured);
  if (prohibited.includes(dir)) throw new AppError(503, 'Armazenamento privado deve ser um diretório dedicado.');
  const repo = await realpath(process.cwd());
  const publicRoot = '/srv/overtrip-public';
  const uploadDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : '/var/lib/overtrip/uploads';
  if (inside(dir, repo) || inside(repo, dir) || inside(dir, publicRoot) || inside(publicRoot, dir) || inside(dir, uploadDir) || inside(uploadDir, dir)) throw new AppError(503, 'Armazenamento privado inválido.');
  return dir;
}

export const SOCIAL_MEDIA_FILE_PATTERN = /^[a-f0-9]{32}\.(jpg|png)$/;

export function socialMediaFilename(key: string): string {
  if (!SOCIAL_MEDIA_FILE_PATTERN.test(key)) throw new AppError(500, 'Arquivo de mídia inválido.');
  return key;
}

export const SOCIAL_MEDIA_CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png' };
