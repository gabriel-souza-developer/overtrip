import { isoToLocalInput } from './dateInput';

export type CalendarTrip = { id: string; title: string; startDateISO: string; endDateISO?: string | null; status: string; city: string; region: string };

/** Preserve datas sem horário (meia-noite UTC) e datas com horário local como no formulário. */
export function tripDay(iso: string): string {
  return isoToLocalInput(iso).slice(0, 10);
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function calendarDays(year: number, month: number): Array<string | null> {
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const days: Array<string | null> = Array(first).fill(null);
  for (let day = 1; day <= count; day++) days.push(prefix + String(day).padStart(2, '0'));
  while (days.length % 7) days.push(null);
  return days;
}

export function tripsByDay(trips: CalendarTrip[]): Map<string, CalendarTrip[]> {
  const days = new Map<string, CalendarTrip[]>();
  for (const trip of trips) {
    const start = tripDay(trip.startDateISO);
    if (!start) continue;
    const requestedEnd = trip.endDateISO ? tripDay(trip.endDateISO) : '';
    const end = requestedEnd >= start ? requestedEnd : start;
    const cursor = new Date(`${start}T12:00:00`);
    const lastDay = new Date(`${end}T12:00:00`);
    while (cursor <= lastDay) {
      const day = `${monthKey(cursor)}-${String(cursor.getDate()).padStart(2, '0')}`;
      const entries = days.get(day) || [];
      entries.push(trip);
      days.set(day, entries);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return days;
}

/** Dia civil de hoje em America/Sao_Paulo ('AAAA-MM-DD'), como o site e a API decidem o que é "próxima". */
export function saoPauloDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Retorna saídas de hoje em diante, sem viagens canceladas ou concluídas. */
export function upcomingTrips(trips: CalendarTrip[], today: string): CalendarTrip[] {
  return trips.filter(trip => {
    const day = tripDay(trip.startDateISO);
    return day && day >= today && trip.status !== 'CANCELLED' && trip.status !== 'COMPLETED';
  }).sort((a, b) => tripDay(a.startDateISO).localeCompare(tripDay(b.startDateISO)) || a.title.localeCompare(b.title, 'pt-BR'));
}

/** "terça-feira, 10 de novembro" -> "Terça-feira, 10 de novembro" (só a primeira letra, como no português). */
export const capitalizeFirst = (text: string): string => text ? text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1) : text;
