import { describe, expect, it } from 'vitest';
import { holidaysForMonth } from '../frontend/src/lib/holidays';

describe('feriados de Campina Grande', () => {
  it('mostra os três feriados nacionais de novembro de 2026 em ordem', () => {
    expect(holidaysForMonth(2026, 10).map(({ date, scope }) => [date, scope])).toEqual([
      ['2026-11-02', 'Nacional'], ['2026-11-15', 'Nacional'], ['2026-11-20', 'Nacional'],
    ]);
  });

  it('calcula as datas móveis em anos diferentes sem repetir a Paixão', () => {
    expect(holidaysForMonth(2026, 3)).toEqual(expect.arrayContaining([{ date: '2026-04-03', name: 'Sexta-feira da Paixão', scope: 'Nacional' }]));
    expect(holidaysForMonth(2026, 5)).toEqual(expect.arrayContaining([{ date: '2026-06-04', name: 'Corpus Christi', scope: 'Campina Grande' }]));
    expect(holidaysForMonth(2027, 2)).toEqual(expect.arrayContaining([{ date: '2027-03-26', name: 'Sexta-feira da Paixão', scope: 'Nacional' }]));
    expect(holidaysForMonth(2027, 4)).toEqual(expect.arrayContaining([{ date: '2027-05-27', name: 'Corpus Christi', scope: 'Campina Grande' }]));
  });

  it('distingue a data magna estadual e os feriados locais', () => {
    expect(holidaysForMonth(2026, 7)).toEqual([{ date: '2026-08-05', name: 'Data magna da Paraíba', scope: 'Paraíba' }]);
    expect(holidaysForMonth(2026, 9)).toEqual(expect.arrayContaining([{ date: '2026-10-11', name: 'Fundação de Campina Grande', scope: 'Campina Grande' }]));
    expect(holidaysForMonth(2026, 11)).toEqual(expect.arrayContaining([{ date: '2026-12-08', name: 'Nossa Senhora da Conceição', scope: 'Campina Grande' }]));
    expect(holidaysForMonth(2026, 5)).toEqual(expect.arrayContaining([{ date: '2026-06-24', name: 'São João', scope: 'Campina Grande' }]));
  });

  it('rejeita mês ou ano fora do intervalo de cálculo', () => {
    expect(holidaysForMonth(2026, 12)).toEqual([]);
    expect(holidaysForMonth(1582, 0)).toEqual([]);
  });
});
