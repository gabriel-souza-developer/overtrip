import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../middleware/errorHandler.js';

export async function documentDirectory(): Promise<string> {
  const configured = process.env.DOCUMENT_STORAGE_DIR;
  if (!configured || !path.isAbsolute(configured)) {
    throw new AppError(503, 'Armazenamento privado de documentos indisponível');
  }
  await mkdir(configured, { recursive: true, mode: 0o700 });
  const directory = await realpath(configured);
  const repository = await realpath(process.cwd());
  if (directory === repository || directory.startsWith(repository + path.sep)) {
    throw new AppError(503, 'Armazenamento de documentos deve ficar fora do projeto');
  }
  return directory;
}

export function documentPath(directory: string, key: string): string {
  if (!/^[0-9a-f-]{36}\.pdf$/.test(key)) throw new Error('Chave de documento inválida');
  return path.join(directory, key);
}

export async function removeDocumentFile(directory: string, key: string): Promise<void> {
  await unlink(documentPath(directory, key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export async function scanPdf(file: string): Promise<void> {
  const scanner = process.env.DOCUMENT_CLAMDSCAN_PATH;
  if (!scanner || !path.isAbsolute(scanner)) throw new AppError(503, 'Scanner de documentos indisponível');
  await new Promise<void>((resolve, reject) => {
    execFile(scanner, ['--no-summary', '--', file], { timeout: 30000, maxBuffer: 65536 }, error => {
      if (!error) return resolve();
      if (error.code === 1) return reject(new AppError(422, 'Documento recusado pelo antivírus'));
      reject(new AppError(503, 'Não foi possível verificar o documento'));
    });
  });
}

export async function storeScannedPdf(body: Buffer): Promise<{ directory: string; key: string }> {
  const directory = await documentDirectory();
  const key = `${randomUUID()}.pdf`;
  const file = documentPath(directory, key);
  await writeFile(file, body, { flag: 'wx', mode: 0o600 });
  try {
    await scanPdf(file);
    return { directory, key };
  } catch (error) {
    await removeDocumentFile(directory, key);
    throw error;
  }
}
