import { describe, expect, it } from 'vitest';
import { reservationMoneyToCents } from '../frontend/src/lib/reservationMoney.js';

describe('reservationMoneyToCents', () => {
  it('converte reais em centavos sem arredondamento', () => {
    expect(reservationMoneyToCents('250,10')).toBe(25010);
    expect(reservationMoneyToCents('12.5')).toBe(1250);
    expect(reservationMoneyToCents(' 0,01 ')).toBe(1);
    expect(reservationMoneyToCents('0')).toBe(0);
  });
  it('rejeita valores ambíguos, negativos ou com mais de duas casas', () => {
    for (const value of ['', '-1', '1,234', '1.000,00', '1e3', '100000000']) {
      expect(reservationMoneyToCents(value)).toBeNull();
    }
  });
});
