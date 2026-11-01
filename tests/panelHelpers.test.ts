import { describe, it, expect } from 'vitest';
import {
  applyTripDefaults, buildPageNumbers, countFilled, formatDateDisplay,
  moveItem, reorderPositions, tripStatusLabel, validateTripMinimum,
} from '../frontend/src/lib/panelHelpers';

describe('formatDateDisplay', () => {
  it('escreve a data por extenso', () => {
    expect(formatDateDisplay('2026-01-15T08:00')).toBe('15 de janeiro de 2026');
    expect(formatDateDisplay('2026-03-05')).toBe('5 de março de 2026');
  });
  it('vazio ou inválido vira texto vazio', () => {
    expect(formatDateDisplay('')).toBe('');
    expect(formatDateDisplay(null)).toBe('');
    expect(formatDateDisplay('2026-13-01')).toBe('');
  });
});

describe('moveItem', () => {
  it('troca com o vizinho sem mexer na lista original', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 1, 'up')).toEqual(['b', 'a', 'c']);
    expect(moveItem(list, 1, 'down')).toEqual(['a', 'c', 'b']);
    expect(list).toEqual(['a', 'b', 'c']);
  });
  it('nas pontas devolve a mesma lista', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 0, 'up')).toBe(list);
    expect(moveItem(list, 1, 'down')).toBe(list);
  });
});

describe('reorderPositions', () => {
  it('reaproveita as posições da página (página 2 não volta ao zero)', () => {
    expect(reorderPositions([22, 20, 21], 20)).toEqual([20, 21, 22]);
  });
  it('numera a partir do início da página quando as posições se repetem', () => {
    expect(reorderPositions([0, 0, 0], 20)).toEqual([20, 21, 22]);
  });
});

describe('buildPageNumbers', () => {
  it('mostra todas quando são poucas', () => expect(buildPageNumbers(1, 3)).toEqual([1, 2, 3]));
  it('centraliza na página atual', () => expect(buildPageNumbers(5, 10)).toEqual([3, 4, 5, 6, 7]));
  it('cola nas pontas', () => {
    expect(buildPageNumbers(1, 10)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPageNumbers(10, 10)).toEqual([6, 7, 8, 9, 10]);
  });
});

describe('countFilled', () => {
  it('conta só o que tem conteúdo', () => {
    expect(countFilled(['', '  ', 'x', null, undefined, 0, false, true, [], ['a']])).toBe(4);
  });
});

describe('applyTripDefaults', () => {
  it('preenche categoria e descrição vazias', () => {
    const r = applyTripDefaults({ title: ' Lucena ', category: '', description: '  ', extra: 1 });
    expect(r).toMatchObject({ category: 'Viagem', description: 'Lucena', extra: 1 });
  });
  it('não troca o que já foi preenchido', () => {
    const r = applyTripDefaults({ title: 'T', category: 'Trilha', description: 'Texto' });
    expect(r).toEqual({ title: 'T', category: 'Trilha', description: 'Texto' });
  });
});

describe('validateTripMinimum', () => {
  const ok = { title: 'T', region: 'PB', city: 'Lucena', startDateISO: '2026-01-01T08:00', status: 'DRAFT', free: false, priceValue: null, media: [] };
  it('rascunho só precisa de título, estado, cidade e data', () => {
    expect(validateTripMinimum(ok)).toEqual({});
  });
  it('aponta o que falta', () => {
    expect(Object.keys(validateTripMinimum({ ...ok, title: ' ', region: '', city: '', startDateISO: '' })).sort())
      .toEqual(['city', 'region', 'startDateISO', 'title']);
  });
  it('para publicar pede foto e valor', () => {
    expect(Object.keys(validateTripMinimum({ ...ok, status: 'OPEN' })).sort()).toEqual(['media', 'priceValue']);
  });
  it('viagem gratuita dispensa o valor', () => {
    expect(validateTripMinimum({ ...ok, status: 'OPEN', free: true, media: [{}] })).toEqual({});
  });
});

describe('tripStatusLabel', () => {
  it('traduz e mantém desconhecidos', () => {
    expect(tripStatusLabel('SOLD_OUT')).toBe('Esgotada');
    expect(tripStatusLabel('X')).toBe('X');
  });
});

import { formatPriceInput, parsePriceInput, publishProblems } from '../frontend/src/lib/panelHelpers';

describe('parsePriceInput', () => {
  it('aceita vírgula e milhares do jeito brasileiro', () => {
    expect(parsePriceInput('109,99')).toBe(109.99);
    expect(parsePriceInput('1.250,00')).toBe(1250);
    expect(parsePriceInput('R$ 1.250,50')).toBe(1250.5);
    expect(parsePriceInput('12.345.678,9')).toBe(12345678.9);
    expect(parsePriceInput('0,5')).toBe(0.5);
  });
  it('aceita número simples e ponto decimal', () => {
    expect(parsePriceInput('1250')).toBe(1250);
    expect(parsePriceInput('109.99')).toBe(109.99);
    expect(parsePriceInput('1.250')).toBe(1250);
    expect(parsePriceInput(' 80 ')).toBe(80);
  });
  it('vazio ou inválido vira null', () => {
    for (const bad of ['', '  ', 'abc', '1,2,3', '1.25.0', '12,345', '-5', '1,999'] ) {
      expect(parsePriceInput(bad)).toBeNull();
    }
    expect(parsePriceInput(null)).toBeNull();
    expect(parsePriceInput(undefined)).toBeNull();
  });
});

describe('formatPriceInput', () => {
  it('escreve no jeito brasileiro e faz ida e volta', () => {
    expect(formatPriceInput(109.99)).toBe('109,99');
    expect(formatPriceInput(1250)).toBe('1.250,00');
    expect(parsePriceInput(formatPriceInput(1250.5))).toBe(1250.5);
    expect(formatPriceInput(null)).toBe('');
  });
});

describe('publishProblems', () => {
  const base = { title: 'T', region: 'PB', city: 'Lucena', startDateISO: '2026-01-01T00:00:00.000Z', free: false, priceValue: 100, media: [{}] };
  it('viagem completa pode ser publicada', () => expect(publishProblems(base)).toEqual([]));
  it('sem foto, avisa para adicionar a foto', () => {
    const problems = publishProblems({ ...base, media: [] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/foto/i);
  });
  it('sem valor, avisa; gratuita não exige valor', () => {
    expect(publishProblems({ ...base, priceValue: null }).join(' ')).toMatch(/valor/i);
    expect(publishProblems({ ...base, priceValue: null, free: true })).toEqual([]);
  });
  it('é a mesma regra do formulário', () => {
    const cases = [base, { ...base, media: [] }, { ...base, priceValue: 0 }, { ...base, free: true, priceValue: null, media: [] }];
    for (const c of cases) {
      expect(publishProblems(c)).toEqual(Object.values(validateTripMinimum({ ...c, status: 'OPEN' })));
    }
  });
});
