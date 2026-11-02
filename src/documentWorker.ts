import 'dotenv/config';
import path from 'node:path';
import { prisma } from './lib/prisma.js';
import { assertExtractionConfigured, extractNextDocument } from './services/documentExtraction.js';
import { documentDirectory } from './services/documentStorage.js';

if (!process.env.DOCUMENT_PDFTOTEXT_PATH || !path.isAbsolute(process.env.DOCUMENT_PDFTOTEXT_PATH) || !process.env.DOCUMENT_STORAGE_DIR) {
  console.error('Configure DOCUMENT_PDFTOTEXT_PATH e DOCUMENT_STORAGE_DIR antes de iniciar o worker.');
  process.exit(1);
}
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

async function main() {
  try { await assertExtractionConfigured(); await documentDirectory(); } catch {
    console.error('Extrator ou armazenamento privado indisponível.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  while (!stopping) {
    try {
      if (await extractNextDocument()) continue;
    } catch {
      console.error('Falha no ciclo de extração de documentos');
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  await prisma.$disconnect();
}
void main();
