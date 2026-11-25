import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** O caminho é (ou virou) um link simbólico, ou não é mais um arquivo regular. */
export class SymlinkRejectedError extends Error {}
/** O caminho não existe. */
export class FileMissingError extends Error {}

/**
 * Tamanho e hash do conteúdo real de um arquivo, sem nunca seguir link
 * simbólico. O_NOFOLLOW faz da checagem e da leitura uma operação atômica só
 * (abrir já falha se o último componente do caminho for um link) — não existe
 * janela entre "verificar que é um arquivo normal" e "ler" em que o caminho
 * possa ser substituído por um link apontando para outro lugar (TOCTOU).
 */
export async function readRegularFileIntegrity(path: string): Promise<{ sizeBytes: number; sha256: string }> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP') throw new SymlinkRejectedError(`Caminho é um link simbólico, recusado: ${path}`);
    if (code === 'ENOENT') throw new FileMissingError(`Arquivo não existe: ${path}`);
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new SymlinkRejectedError(`Caminho não é um arquivo regular: ${path}`);
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(1 << 16);
    let sizeBytes = 0;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      hash.update(chunk.subarray(0, bytesRead));
      sizeBytes += bytesRead;
    }
    return { sizeBytes, sha256: hash.digest('hex') };
  } finally {
    await handle.close();
  }
}
