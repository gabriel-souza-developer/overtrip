import { describe, expect, it } from 'vitest';
import { hasRequiredDeposit, paidInstallmentsCents, requiredDepositCents } from '../src/services/reservationDeposit.js';

describe('sinal de 50% para confirmação de reserva', () => {
  it('arredonda o sinal para cima em valores ímpares de centavos', () => {
    expect(requiredDepositCents(10_001)).toBe(5_001);
  });

  it('não conta parcelas previstas como pagamento recebido', () => {
    const installments = [
      { amountCents: 5_000, paidAt: null },
      { amountCents: 4_900, paidAt: new Date('2026-11-26T12:00:00Z') },
    ];
    expect(paidInstallmentsCents(installments)).toBe(4_900);
    expect(hasRequiredDeposit(10_000, installments)).toBe(false);
  });

  it('atingir exatamente 50% libera a confirmação humana', () => {
    const installments = [
      { amountCents: 2_500, paidAt: new Date('2026-11-26T12:00:00Z') },
      { amountCents: 2_500, paidAt: new Date('2026-11-26T12:01:00Z') },
      { amountCents: 5_000, paidAt: null },
    ];
    expect(paidInstallmentsCents(installments)).toBe(5_000);
    expect(hasRequiredDeposit(10_000, installments)).toBe(true);
  });

  it('não trata um depósito abaixo de 50% como suficiente', () => {
    expect(hasRequiredDeposit(10_000, [{ amountCents: 4_999, paidAt: new Date() }])).toBe(false);
  });
});
