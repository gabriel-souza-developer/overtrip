// Conversão entre ISO 8601 (API, UTC com fuso) e o valor de <input type="datetime-local">
// (sem fuso, no horário do navegador).
//
// Datas "só com o dia" são guardadas à meia-noite UTC (…T00:00:00.000Z). Mostradas no fuso
// do Brasil, viravam o dia anterior (21:00 do dia 28 em vez do dia 29). Por isso a meia-noite
// UTC é sempre lida e mostrada como o dia que ela representa, sem conversão de fuso.

const pad = (n: number) => String(n).padStart(2, '0');

/** true se o instante é exatamente 00:00:00.000 UTC (data sem hora). */
export function isDateOnlyIso(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

/** ISO -> 'YYYY-MM-DDTHH:mm' no fuso do navegador (data sem hora: o dia certo, às 00:00). Vazio/inválido -> ''. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isDateOnlyIso(iso)) return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Valor do input (horário local) -> ISO com fuso (UTC). Vazio/inválido -> null.
 * - Se `originalIso` é passado e o valor não mudou desde que foi mostrado, devolve o original
 *   intacto (abrir e salvar sem mexer na data não altera o que está guardado).
 * - Meia-noite (T00:00) é "só o dia" e vira 00:00 UTC do mesmo dia.
 */
export function localInputToIso(value: string | null | undefined, originalIso?: string | null): string | null {
  if (!value) return null;
  if (originalIso && isoToLocalInput(originalIso) === value) return originalIso;
  const dateOnly = /^(\d{4}-\d{2}-\d{2})T00:00(?::00)?$/.exec(value);
  if (dateOnly) {
    const d = new Date(`${dateOnly[1]}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** dd/mm/aaaa do dia certo (data sem hora não anda um dia para trás). Vazio/inválido -> '—'. */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const source = isDateOnlyIso(iso)
    ? { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() }
    : { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
  return `${pad(source.day)}/${pad(source.month)}/${source.year}`;
}
