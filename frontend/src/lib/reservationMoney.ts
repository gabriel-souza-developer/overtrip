/** Converte reais para centavos inteiros, sem arredondamento de ponto flutuante. */
export function reservationMoneyToCents(value: string): number | null {
  const match = /^(\d{1,8})(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}
