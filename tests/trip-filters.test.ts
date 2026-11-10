import { describe, expect, it } from 'vitest';
import { tripCreateSchema, tripUpdateSchema } from '../src/validators/index';
// @ts-expect-error módulo JS do site
import { categoryOptions, matchesTripFilters } from '../js/tripFilters.js';

describe('filtros das próximas viagens', () => {
  it('lista categorias distintas sem alterar rótulos compostos ou incluir valores vazios', () => {
    expect(categoryOptions(['Trilha, natureza', '  PRAIA ', 'praia', '', null])).toEqual([
      { value: 'praia', label: 'PRAIA' },
      { value: 'trilha, natureza', label: 'Trilha, natureza' },
    ]);
  });

  it('combina categoria, mês e busca sem diferenciar acentos ou maiúsculas', () => {
    const card = { month: 'NOV', category: 'Trilha e Natureza', text: 'Expedição em Lucena' };
    const filters = { activeMonth: 'NOV', activeCategory: 'trilha e natureza', search: 'expedicao' };
    expect(matchesTripFilters(card, filters)).toBe(true);
    expect(matchesTripFilters(card, { ...filters, activeMonth: 'DEZ' })).toBe(false);
    expect(matchesTripFilters(card, { ...filters, activeCategory: 'praia' })).toBe(false);
    expect(matchesTripFilters(card, { ...filters, search: 'outra' })).toBe(false);
    expect(matchesTripFilters(card, { activeMonth: 'all', activeCategory: '', search: '' })).toBe(true);
  });

  it('aceita categoria própria opcional sem alterar a chamada editorial', () => {
    const old = { title: 'Lucena', category: 'TRILHA, NATUREZA E PATRIMÔNIO', description: 'Passeio', city: 'Lucena', region: 'PB', startDateISO: '2026-11-29T06:00:00-03:00' };
    expect(tripCreateSchema.parse(old).filterCategory).toBeUndefined();
    expect(tripCreateSchema.parse({ ...old, filterCategory: ' Trilha ' })).toMatchObject({ category: old.category, filterCategory: 'Trilha' });
    expect(tripUpdateSchema.parse({ filterCategory: null })).toEqual({ filterCategory: null });
  });
});
