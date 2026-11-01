import { describe, it, expect } from 'vitest';
import { applySuggestions, buildSuggestionRows, isFieldFilled } from '../frontend/src/lib/aiDraft';

const defaults = { priceUnit: 'por pessoa', startDateISO: '2026-10-31T10:00' };
const form = () => ({
  title: 'Meu título', description: '', city: '', priceValue: null as number | null, priceUnit: 'por pessoa',
  includes: [] as string[], startDateISO: '2026-10-31T10:00', free: false,
});

describe('aplicar sugestões da IA', () => {
  it('preenche campos vazios escolhidos', () => {
    const f = form();
    const out = applySuggestions(f, { description: 'Texto', priceValue: 99, includes: ['Café'] }, ['description', 'priceValue', 'includes'], [], defaults);
    expect(out).toMatchObject({ description: 'Texto', priceValue: 99, includes: ['Café'] });
    expect(f.description).toBe(''); // original intacto
  });

  it('não sobrescreve campo preenchido sem marcação', () => {
    const out = applySuggestions(form(), { title: 'Novo título' }, ['title'], [], defaults);
    expect(out.title).toBe('Meu título');
  });

  it('sobrescreve campo preenchido quando marcado', () => {
    const out = applySuggestions(form(), { title: 'Novo título' }, ['title'], ['title'], defaults);
    expect(out.title).toBe('Novo título');
  });

  it('ignora campo não escolhido, fora do esquema e valor vazio', () => {
    const out = applySuggestions(form(), { description: 'x', status: 'OPEN', city: '' } as never, ['city', 'status' as never], [], defaults);
    expect(out).toEqual(form());
  });

  it('valor padrão (data e unidade) conta como vazio', () => {
    const out = applySuggestions(form(), { startDateISO: '2027-01-02T00:00:00.000Z' }, ['startDateISO'], [], defaults);
    expect(out.startDateISO).toBe('2027-01-02T00:00:00.000Z');
    expect(isFieldFilled('por pessoa', 'por pessoa')).toBe(false);
  });
});

describe('resumo campo atual x sugerido', () => {
  it('marca quais campos já têm valor e omite sugestões iguais', () => {
    const rows = buildSuggestionRows(form(), { title: 'Novo', description: 'Desc', city: 'Patos', priceValue: 99.5 }, defaults);
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    expect(byKey.title).toMatchObject({ hasCurrent: true, current: 'Meu título', suggested: 'Novo' });
    expect(byKey.description).toMatchObject({ hasCurrent: false, current: '—' });
    expect(byKey.priceValue.suggested).toBe('99,50');
    expect(buildSuggestionRows(form(), { title: 'Meu título' }, defaults)).toHaveLength(0);
  });
});
