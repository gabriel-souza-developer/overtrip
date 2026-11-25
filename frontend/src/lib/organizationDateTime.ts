// Nesta tela o campo contém data E hora. Uma meia-noite UTC pode representar
// 21h no Brasil, portanto não deve ser interpretada como data sem horário.
export function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalDateTime(value: string, original?: string | null): string | null {
  if (!value) return null;
  if (original && toLocalDateTime(original) === value) return original;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
