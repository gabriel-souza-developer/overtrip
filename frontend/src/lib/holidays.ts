export type Holiday = { date: string; name: string; scope: 'Nacional' | 'Paraíba' | 'Campina Grande' };

// Referências: calendário federal de 2026 https://legis.sigepe.gov.br/sigepe-bgp-ws-legis/legis-service/download/?id=0026440285-ALPDF%2F2025
// Lei municipal 7.197/2019 https://campinagrande.pb.gov.br/wp-content/uploads/2019/06/Seman%C3%A1rio-Oficial-n%C2%BA-2.626-03-a-07-de-junho-de-2019.pdf
// Data magna estadual: Lei 10.601/2015 https://static.paraiba.pb.gov.br/2016/08/Diario-Oficial-02-08-2016.pdf
const fixed: Array<[number, number, string, Holiday['scope']]> = [
  [1, 1, 'Confraternização Universal', 'Nacional'], [4, 21, 'Tiradentes', 'Nacional'],
  [5, 1, 'Dia do Trabalho', 'Nacional'], [6, 24, 'São João', 'Campina Grande'],
  [8, 5, 'Data magna da Paraíba', 'Paraíba'], [9, 7, 'Independência do Brasil', 'Nacional'],
  [10, 11, 'Fundação de Campina Grande', 'Campina Grande'], [10, 12, 'Nossa Senhora Aparecida', 'Nacional'],
  [11, 2, 'Finados', 'Nacional'], [11, 15, 'Proclamação da República', 'Nacional'],
  [11, 20, 'Dia Nacional de Zumbi e da Consciência Negra', 'Nacional'],
  [12, 8, 'Nossa Senhora da Conceição', 'Campina Grande'], [12, 25, 'Natal', 'Nacional'],
];

/** Páscoa no calendário gregoriano, em UTC para evitar variação por fuso. */
function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Feriados recorrentes para planejamento; não inclui pontos facultativos. */
export function holidaysForMonth(year: number, month: number): Holiday[] {
  if (!Number.isInteger(year) || year < 1583 || year > 4099 || !Number.isInteger(month) || month < 0 || month > 11) return [];
  const key = (m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const all: Holiday[] = fixed.map(([m, d, name, scope]) => ({ date: key(m, d), name, scope }));
  const easterDate = easter(year);
  // A portaria federal de 2026 classifica a Paixão como nacional; a lei local
  // também a inclui. Mostramos uma única entrada para a data.
  for (const [offset, name, scope] of [[-2, 'Sexta-feira da Paixão', 'Nacional'], [60, 'Corpus Christi', 'Campina Grande']] as const) {
    const date = new Date(easterDate.getTime() + offset * 86_400_000);
    all.push({ date: key(date.getUTCMonth() + 1, date.getUTCDate()), name, scope });
  }
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  return all.filter((holiday) => holiday.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
}
