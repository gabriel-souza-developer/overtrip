import { randomBytes } from 'node:crypto';
import { mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { AppError } from '../middleware/errorHandler.js';
import { MEDIA_PUBLIC_PREFIX } from '../validators/imageSrc.js';
import type { ProcessedImage } from './mediaProcessing.js';

/** Pasta publicada pelo Caddy: as imagens nunca são gravadas lá. */
const PUBLIC_SITE_ROOT = '/srv/overtrip-public';

/** Nome de arquivo gerado pelo servidor: 32 hex + versão principal ou variante WebP. */
export const MEDIA_FILE_PATTERN = /^[0-9a-f]{32}(?:\.(?:jpg|png)|-w(?:640|960|1280)\.webp)$/;

export function defaultUploadsDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UPLOADS_DIR) return env.UPLOADS_DIR;
  return env.NODE_ENV === 'production'
    ? '/var/lib/overtrip/uploads'
    : path.join(homedir(), '.local', 'share', 'overtrip-dev', 'uploads');
}

const isInside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);

export async function mediaDirectory(): Promise<string> {
  const configured = defaultUploadsDir();
  if (!path.isAbsolute(configured)) throw new AppError(503, 'Armazenamento de imagens indisponível');
  await mkdir(configured, { recursive: true, mode: 0o750 });
  const directory = await realpath(configured);
  const repository = await realpath(process.cwd());
  if (isInside(directory, repository) || isInside(directory, PUBLIC_SITE_ROOT)) {
    throw new AppError(503, 'Armazenamento de imagens deve ficar fora do projeto e do site publicado');
  }
  return directory;
}

export function mediaFilePath(directory: string, filename: string): string {
  if (!MEDIA_FILE_PATTERN.test(filename)) throw new Error('Nome de arquivo de mídia inválido');
  return path.join(directory, filename);
}

export function mediaFilenames(key: string, ext: 'jpg' | 'png', widths: readonly number[]): string[] {
  return [`${key}.${ext}`, ...widths.map((width) => `${key}-w${width}.webp`)];
}

export const mediaPublicSrc = (filename: string) => `${MEDIA_PUBLIC_PREFIX}${filename}`;

export async function removeMediaFiles(directory: string, filenames: string[]): Promise<void> {
  await Promise.all(filenames.map((name) => unlink(mediaFilePath(directory, name)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  })));
}

/** Grava a versão principal e as variantes; em qualquer falha, apaga o que já foi escrito. */
export async function storeProcessedImage(image: ProcessedImage): Promise<{ directory: string; key: string; filenames: string[] }> {
  const directory = await mediaDirectory();
  const key = randomBytes(16).toString('hex');
  const filenames = mediaFilenames(key, image.ext, image.variants.map((v) => v.width));
  const buffers = [image.main, ...image.variants.map((v) => v.buffer)];
  try {
    for (let i = 0; i < filenames.length; i++) {
      await writeFile(mediaFilePath(directory, filenames[i]), buffers[i], { flag: 'wx', mode: 0o640 });
    }
  } catch (error) {
    await removeMediaFiles(directory, filenames).catch(() => {});
    throw error;
  }
  return { directory, key, filenames };
}
