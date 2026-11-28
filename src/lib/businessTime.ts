const businessTimeZone = 'America/Sao_Paulo';

function zonedMidnightUtc(year: number, month: number, day: number): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let instant = targetAsUtc;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: businessTimeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const adjusted = targetAsUtc - (renderedAsUtc - instant);
    if (adjusted === instant) break;
    instant = adjusted;
  }
  return new Date(instant);
}

/** Limite exclusivo do fim do dia atual no fuso de operação da empresa. */
export function startOfTomorrowInBusinessZone(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: businessTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return zonedMidnightUtc(Number(values.year), Number(values.month), Number(values.day) + 1);
}
