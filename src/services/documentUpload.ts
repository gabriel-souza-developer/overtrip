/** Regras independentes de HTTP para anexos privados da Fase 3. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MAX_PER_TRIP = 5;

export class DocumentUploadError extends Error {
  constructor(public status: 400 | 413 | 415, message: string) {
    super(message);
  }
}

/**
 * O Content-Type e a extensão são declarações do cliente; exigimos também a
 * assinatura PDF. Isto não substitui a varredura antivírus nem o parser.
 */
export function assertPdfUpload(contentType: string | undefined, body: unknown, maxBytes = DOCUMENT_MAX_BYTES): Buffer {
  if (contentType?.split(';', 1)[0].trim().toLowerCase() !== 'application/pdf') {
    throw new DocumentUploadError(415, 'Envie um arquivo PDF.');
  }
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new DocumentUploadError(400, 'O arquivo PDF está vazio.');
  }
  if (body.length > maxBytes) {
    throw new DocumentUploadError(413, `O PDF ultrapassa o limite de ${Math.floor(maxBytes / 1024 / 1024)} MiB.`);
  }
  if (!body.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new DocumentUploadError(400, 'O arquivo não possui uma assinatura PDF válida.');
  }
  return body;
}
