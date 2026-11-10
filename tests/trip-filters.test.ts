import { describe, expect, it } from 'vitest';
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
});
