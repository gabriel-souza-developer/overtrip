/** Valores de reserva e pagamento sempre mostram centavos, inclusive quando são zero. */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
