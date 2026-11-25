import { constants } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, realpath, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { AppError } from '../middleware/errorHandler.js';
import { MEDIA_PUBLIC_PREFIX } from '../validators/imageSrc.js';
import type { ProcessedTripMedia } from './tripMediaUpload.js';

/** Pasta publicada pelo Caddy: as imagens nunca são gravadas lá. */
const PUBLIC_SITE_ROOT = '/srv/overtrip-public';

/** Nome de arquivo gerado pelo servidor: 32 hex + versão principal ou variante WebP. */
export const MEDIA_FILE_PATTERN = /^[0-9a-f]{32}(?:\.(?:jpg|png|mp4)|-w(?:640|960|1280)\.webp)$/;

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

/** `storageKey` (os 32 hex iniciais) a partir do nome do arquivo principal ou de uma variante; exige o padrão acima. */
export function mediaStorageKeyFromFilename(filename: string): string {
  if (!MEDIA_FILE_PATTERN.test(filename)) throw new Error('Nome de arquivo de mídia inválido');
  return filename.slice(0, 32);
}

export function mediaFilenames(key: string, ext: 'jpg' | 'png' | 'mp4', widths: readonly number[]): string[] {
  return [`${key}.${ext}`, ...widths.map((width) => `${key}-w${width}.webp`)];
}

export const mediaPublicSrc = (filename: string) => `${MEDIA_PUBLIC_PREFIX}${filename}`;

export async function removeMediaFiles(directory: string, filenames: string[]): Promise<void> {
  await Promise.all(filenames.map((name) => unlink(mediaFilePath(directory, name)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  })));
}

/** 128 bits aleatórios: nome de arquivo final, reservado antes de gravar para poder registrar o MediaAsset pendente primeiro. */
export function reserveStorageKey(): string {
  return randomBytes(16).toString('hex');
}

export interface FileIntegrityEntry { name: string; sizeBytes: number; sha256: string }

/**
 * Tamanho e hash de cada arquivo que writeImageFiles vai gravar, calculados
 * a partir dos buffers já em memória — ANTES de qualquer gravação. Guardado
 * no MediaAsset pendente (campo fileIntegrity) para que reconcilePendingMedia
 * possa provar que um arquivo em disco é exatamente o que devia ter sido
 * gravado, não apenas que um arquivo com aquele nome existe (pode estar
 * truncado por uma queda no meio da escrita).
 */
export function describeExpectedFiles(image: ProcessedTripMedia, key: string): FileIntegrityEntry[] {
  const filenames = mediaFilenames(key, image.ext, image.variants.map((v) => v.width));
  const buffers = [image.main, ...image.variants.map((v) => v.buffer)];
  return filenames.map((name, index) => ({
    name, sizeBytes: buffers[index].length, sha256: createHash('sha256').update(buffers[index]).digest('hex'),
  }));
}

/**
 * Erro de gravação em que a limpeza do que já tinha sido escrito também
 * falhou: pode ter sobrado arquivo parcial em disco. O chamador NUNCA deve
 * apagar o registro pendente correspondente neste caso — apagá-lo mesmo
 * assim perderia o único rastro de que esses arquivos existem e a quem
 * pertencem (ver auditoria independente sobre reconcilePendingMedia).
 */
export class MediaWriteCleanupError extends Error {
  constructor(public readonly originalError: unknown) { super('Falha ao gravar e também ao limpar arquivos de mídia parciais'); }
}

/**
 * Grava a versão principal e as variantes sob uma chave já reservada; em
 * qualquer falha, apaga o que já foi escrito. Separado da reserva da chave
 * (acima) para que o chamador possa criar o registro do MediaAsset como
 * pendente ANTES de gravar qualquer arquivo — nunca o contrário, que deixaria
 * um arquivo em disco sem registro nenhum numa falha/queda no meio do caminho.
 */
/** O caminho é (ou virou) link simbólico, ou não é mais um arquivo regular. */
export class MediaSymlinkRejectedError extends Error {}
/** O caminho não existe. */
export class MediaFileMissingError extends Error {}

/**
 * Lê o conteúdo de um arquivo de mídia para servir, sem nunca seguir link
 * simbólico. `open` com O_NOFOLLOW torna a checagem e a leitura uma operação
 * atômica só — não existe janela entre "verificar que é um arquivo normal" e
 * "ler para responder" em que o caminho possa ser trocado por um link
 * (TOCTOU). A rota pública serve sempre o buffer retornado aqui, nunca abre o
 * caminho de novo por fora (ex.: res.sendFile), o que reabriria essa janela.
 */
export async function readMediaFileForServing(directory: string, filename: string): Promise<{ buffer: Buffer; sizeBytes: number; sha256: string }> {
  const filePath = mediaFilePath(directory, filename);
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP') throw new MediaSymlinkRejectedError(`Caminho é um link simbólico, recusado: ${filePath}`);
    if (code === 'ENOENT') throw new MediaFileMissingError(`Arquivo não existe: ${filePath}`);
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new MediaSymlinkRejectedError(`Caminho não é um arquivo regular: ${filePath}`);
    const buffer = await handle.readFile();
    return { buffer, sizeBytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
  } finally {
    await handle.close();
  }
}

export async function writeImageFiles(image: ProcessedTripMedia, key: string): Promise<{ directory: string; filenames: string[] }> {
  const directory = await mediaDirectory();
  const filenames = mediaFilenames(key, image.ext, image.variants.map((v) => v.width));
  const buffers = [image.main, ...image.variants.map((v) => v.buffer)];
  try {
    for (let i = 0; i < filenames.length; i++) {
      await writeFile(mediaFilePath(directory, filenames[i]), buffers[i], { flag: 'wx', mode: 0o640 });
    }
  } catch (error) {
    try {
      await removeMediaFiles(directory, filenames);
    } catch {
      throw new MediaWriteCleanupError(error);
    }
    throw error;
  }
  return { directory, filenames };
}
