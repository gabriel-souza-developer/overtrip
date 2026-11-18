/** Datas antigas à meia-noite UTC representam apenas um dia; demais valores são instantes de São Paulo. */
export function organizationFollowUpDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(value)) return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function formatOrganizationFollowUpDate(value: string): string {
  const day = organizationFollowUpDate(value);
  return day ? day.split('-').reverse().join('/') : '—';
}
