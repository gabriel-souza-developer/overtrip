import { describe, expect, it } from 'vitest';
import { aiDraftOutputSchema, type AiProvider } from '../src/services/aiTripDraft';
import { generateDocumentSuggestions } from '../src/services/documentSuggestions';

const document = { id: 'doc1', originalFilename: 'roteiro.pdf', pages: [{ pageNumber: 1, text: 'Viagem para Natal. Saída em 10/12/2027. Preço R$ 200.' }, { pageNumber: 2, text: 'Incluso transporte.' }] };
function provider(partial: Record<string, unknown>): AiProvider {
  const empty = Object.fromEntries(Object.keys(aiDraftOutputSchema.shape).map(key => [key, key === 'warnings' ? [] : null]));
  return { name: 'gemini', defaultModel: 'test', generate: async () => ({ object: { ...empty, ...partial }, stopReason: 'end' }) };
}
describe('sugestões de documentos', () => {
  it('retorna apenas campos com fonte literal na página informada', async () => {
    const result = await generateDocumentSuggestions(provider({ city: 'Natal', priceValue: 200, startDate: '2027-12-10', sources: [
      { field: 'city', page: 1, excerpt: 'Viagem para Natal' },
      { field: 'priceValue', page: 2, excerpt: 'Preço R$ 200' },
      { field: 'startDate', page: 1, excerpt: 'Saída em 10/12/2027' },
    ] }), document);
    expect(result.draft).toEqual({ city: 'Natal', startDateISO: '2027-12-10T00:00:00.000Z' });
    expect(result.sources.city).toEqual({ documentId: 'doc1', filename: 'roteiro.pdf', page: 1, excerpt: 'Viagem para Natal' });
    expect(result.warnings).toContain('Algumas sugestões foram descartadas por falta de trecho verificável.');
  });
  it('não aceita citação criada pela IA nem texto fora do limite enviado', async () => {
    const longDocument = { ...document, pages: [{ pageNumber: 1, text: 'a'.repeat(8000) + ' Natal' }] };
    const result = await generateDocumentSuggestions(provider({ city: 'Natal', sources: [{ field: 'city', page: 1, excerpt: 'Natal' }] }), longDocument);
    expect(result.draft).toEqual({});
    expect(result.warnings.join(' ')).toContain('apenas o início');
  });
  it('não revela erros do provedor', async () => {
    const p = provider({});
    p.generate = async () => { throw new Error('texto privado e segredo'); };
    await expect(generateDocumentSuggestions(p, document)).rejects.toThrow('A ajuda de IA não está disponível agora.');
  });
});
