import { isoToLocalInput } from './dateInput';

export type CalendarTrip = { id: string; title: string; startDateISO: string; status: string; city: string; region: string };

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
    const day = tripDay(trip.startDateISO);
    if (!day) continue;
    const entries = days.get(day) || [];
    entries.push(trip);
    days.set(day, entries);
  }
  return days;
}
