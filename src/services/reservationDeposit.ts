/** Política de sinal da operação: metade do valor final, arredondada para cima. */
export function requiredDepositCents(totalCents: number): number {
  return Math.ceil(Math.max(0, totalCents) / 2);
}

export function paidInstallmentsCents(installments: readonly { amountCents: number; paidAt: Date | null }[]): number {
  return installments.reduce((sum, installment) => sum + (installment.paidAt ? installment.amountCents : 0), 0);
}

export function hasRequiredDeposit(totalCents: number, installments: readonly { amountCents: number; paidAt: Date | null }[]): boolean {
  const required = requiredDepositCents(totalCents);
  return required === 0 || paidInstallmentsCents(installments) >= required;
}
