import { readdir, stat } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { documentDirectory, documentPath, removeDocumentFile } from './documentStorage.js';

export async function purgeExpiredDocuments(): Promise<void> {
  const directory = await documentDirectory();
  const expired = await prisma.tripDocument.findMany({ where: { retentionUntil: { lte: new Date() } } });
  for (const document of expired) {
    await removeDocumentFile(directory, document.storageKey);
    await prisma.tripDocument.deleteMany({ where: { id: document.id } });
  }
  // A margem protege uploads em varredura/commit. Também limpa arquivos de
  // viagens apagadas e arquivos deixados por processos interrompidos.
  for (const key of await readdir(directory)) {
    if (!/^[0-9a-f-]{36}\.pdf$/.test(key)) continue;
    const info = await stat(documentPath(directory, key)).catch(() => null);
    if (!info || info.mtimeMs > Date.now() - 60 * 60 * 1000) continue;
    if (!await prisma.tripDocument.findUnique({ where: { storageKey: key } })) {
      await removeDocumentFile(directory, key);
    }
  }
}

export function startDocumentRetention(): () => void {
  if (!process.env.DOCUMENT_STORAGE_DIR) return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await purgeExpiredDocuments(); }
    catch { console.error('Falha na limpeza de documentos privados'); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
