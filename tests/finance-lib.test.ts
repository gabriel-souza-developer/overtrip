import { describe, it, expect } from 'vitest';
import { compactMoney, money, niceScale, percentChange, pointsChange } from '../frontend/src/lib/finance';

describe('painel financeiro: regras de exibição', () => {
  it('variação só existe com base de comparação', () => {
    expect(percentChange(110000, 191100)).toBe(-42.4);
    expect(percentChange(191100, 0)).toBeNull();
    expect(percentChange(100, null)).toBeNull();
    expect(percentChange(-50, -100)).toBe(50);
    expect(pointsChange(16.1, 25.3)).toBe(-9.2);
    expect(pointsChange(null, 25.3)).toBeNull();
  });

  it('escala do eixo inclui o zero e usa passos redondos', () => {
    expect(niceScale([0, 61500, 82000, 2500])).toEqual({ min: 0, max: 100000, step: 25000 });
    expect(niceScale([-30000, 90000])).toEqual({ min: -50000, max: 100000, step: 50000 });
    expect(niceScale([])).toEqual({ min: 0, max: 1, step: 1 });
  });

  it('formata reais', () => {
    expect(money(191100)).toMatch(/R\$\s?1\.911$/);
    expect(money(8550)).toMatch(/85,50$/);
    expect(money(null)).toBe('—');
    expect(compactMoney(191100)).toBe('R$ 1,9 mil');
    expect(compactMoney(-50000)).toBe('−R$ 500');
  });
});
