// Conversão entre ISO 8601 (API, UTC com fuso) e o valor de <input type="datetime-local">
// (sem fuso, no horário do navegador).

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO -> 'YYYY-MM-DDTHH:mm' no fuso do navegador. Vazio/inválido -> ''. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor do input (horário local) -> ISO com fuso (UTC). Vazio/inválido -> null. */
export function localInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
