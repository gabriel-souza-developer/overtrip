import { describe, expect, it } from 'vitest';
import { assertPdfUpload, DocumentUploadError } from '../src/services/documentUpload.js';

const PDF = Buffer.from('%PDF-1.7\nconteúdo de teste');

describe('assertPdfUpload', () => {
  it('aceita um PDF com MIME e assinatura válidos', () => {
    expect(assertPdfUpload('application/pdf; charset=binary', PDF)).toBe(PDF);
  });

  it.each([
    ['image/png', PDF, 415],
    ['application/pdf', Buffer.alloc(0), 400],
    ['application/pdf', Buffer.from('not-pdf'), 400],
    ['application/pdf', Buffer.concat([PDF, Buffer.alloc(11)]), 413],
  ])('recusa entrada inválida (%s)', (type, body, status) => {
    try {
      assertPdfUpload(type, body, 10);
      throw new Error('deveria ter falhado');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentUploadError);
      expect((error as DocumentUploadError).status).toBe(status);
    }
  });
});
