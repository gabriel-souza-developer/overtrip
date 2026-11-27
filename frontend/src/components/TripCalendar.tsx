import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { tripApi } from '../api';
import { calendarDays, capitalizeFirst, monthKey, tripsByDay, tripDay, type CalendarTrip } from '../lib/tripCalendar';
import { tripStatusLabel, tripStatusTone } from '../lib/panelHelpers';
import StatusBadge from './StatusBadge';
import ErrorState from './ErrorState';
import { holidaysForMonth } from '../lib/holidays';

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const initialMonth = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); };
const localDay = (date: Date) => `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Calendário do painel. O mês controla também as referências sazonais ao lado. */
export default function TripCalendar({ month: controlledMonth, onMonthChange }: { month?: Date; onMonthChange?: (month: Date) => void } = {}) {
  const [ownMonth, setOwnMonth] = useState(initialMonth);
  const month = controlledMonth ?? ownMonth;
  const [selected, setSelected] = useState(() => localDay(new Date()));
  const dayButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const [trips, setTrips] = useState<CalendarTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const first = await tripApi.list({ page: 1, limit: 100 });
        const pages = await Promise.all(Array.from({ length: Math.max(0, first.pagination.totalPages - 1) }, (_, i) => tripApi.list({ page: i + 2, limit: 100 })));
        if (active) setTrips([first, ...pages].flatMap(page => page.data));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar as viagens.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);

  const days = useMemo(() => calendarDays(month.getFullYear(), month.getMonth()), [month]);
  const grouped = useMemo(() => tripsByDay(trips), [trips]);
  const holidays = useMemo(() => holidaysForMonth(month.getFullYear(), month.getMonth()), [month]);
  const holidaysByDay = useMemo(() => {
    const result = new Map<string, typeof holidays>();
    for (const holiday of holidays) result.set(holiday.date, [...(result.get(holiday.date) || []), holiday]);
    return result;
  }, [holidays]);
  const chosen = grouped.get(selected) || [];
  const label = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month));
  const selectedLabel = selected.split('-').reverse().join('/');
  const goTo = (next: Date) => {
    setOwnMonth(next); onMonthChange?.(next);
    const today = new Date();
    setSelected(monthKey(next) === monthKey(today) ? localDay(today) : `${monthKey(next)}-01`);
  };
  const changeMonth = (delta: number) => goTo(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const monthPrefix = `${monthKey(month)}-`;
  const monthTripCount = useMemo(() => new Set([...grouped.entries()].filter(([day]) => day.startsWith(monthPrefix)).flatMap(([, list]) => list.map(trip => trip.id))).size, [grouped, monthPrefix]);
  const tripYears = useMemo(() => trips.flatMap(trip => [trip.startDateISO, trip.endDateISO].filter((date): date is string => !!date).map(date => Number(tripDay(date).slice(0, 4)))).filter(year => year >= 2000 && year <= 2100), [trips]);
  const currentYear = new Date().getFullYear();
  const firstYear = Math.min(currentYear - 2, month.getFullYear(), ...tripYears);
  const lastYear = Math.max(currentYear + 2, month.getFullYear(), ...tripYears);
  const yearChoices = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const isCurrentMonth = monthKey(month) === monthKey(new Date());
  const moveFocus = (day: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const date = new Date(`${day}T12:00:00`);
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0;
    let next: Date | null = null;
    if (delta) {
      date.setDate(date.getDate() + delta);
      if (date.getMonth() === month.getMonth()) next = date;
    } else if (event.key === 'Home') next = new Date(month.getFullYear(), month.getMonth(), 1);
    else if (event.key === 'End') next = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    if (next) {
      event.preventDefault();
      const key = localDay(next);
      setSelected(key);
      dayButtons.current[key]?.focus();
    }
  };

  return (
    <section aria-labelledby="calendario-title" className="min-w-0 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
      {error && <ErrorState message={error} onRetry={() => setAttempt(n => n + 1)} />}
      <div className="min-w-0" aria-busy={loading}>
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><h3 id="calendario-title" className="text-lg font-bold text-surface-900">Calendário</h3><p className="text-sm text-surface-600">{loading ? 'Carregando viagens…' : `${monthTripCount} ${monthTripCount === 1 ? 'viagem no mês' : 'viagens no mês'}`}</p></div></div>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,6rem)_auto] items-center gap-2">
          <label className="sr-only" htmlFor="calendar-month">Mês do calendário</label>
          <select id="calendar-month" className="select min-h-10 py-1.5 text-sm" value={month.getMonth()} onChange={event => goTo(new Date(month.getFullYear(), Number(event.target.value), 1))}>{MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select>
          <label className="sr-only" htmlFor="calendar-year">Ano do calendário</label>
          <select id="calendar-year" className="select min-h-10 py-1.5 text-sm" value={month.getFullYear()} onChange={event => goTo(new Date(Number(event.target.value), month.getMonth(), 1))}>{yearChoices.map(year => <option key={year} value={year}>{year}</option>)}</select>
          <button type="button" className="btn-secondary min-h-10 px-3 py-1.5 text-sm" onClick={() => goTo(initialMonth())} disabled={isCurrentMonth}>Hoje</button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-50 px-1 py-1">
          <button type="button" className="rounded-lg p-2 hover:bg-white focus-visible:outline focus-visible:outline-2" onClick={() => changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
          <p className="text-center text-sm font-semibold text-surface-900" aria-live="polite">{label}<span className="block text-xs font-normal text-surface-600">{holidays.length ? `${holidays.length} ${holidays.length === 1 ? 'feriado' : 'feriados'} no mês` : 'Selecione um dia para ver a agenda'}</span></p>
          <button type="button" className="rounded-lg p-2 hover:bg-white focus-visible:outline focus-visible:outline-2" onClick={() => changeMonth(1)} aria-label="Próximo mês"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div className="mt-2 grid grid-cols-7 text-center text-xs font-semibold text-surface-600" aria-hidden="true">{weekdays.map((day, index) => <span key={day} className={`py-2 ${index === 0 || index === 6 ? 'text-surface-500' : ''}`}>{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-y-1" role="group" aria-label={`Datas de ${label}`}>
          {days.map((day, index) => day ? <button key={day} ref={element => { dayButtons.current[day] = element; }} type="button" tabIndex={selected === day ? 0 : -1} aria-pressed={selected === day} aria-label={`${day.split('-').reverse().join('/')}, ${(grouped.get(day) || []).length} ${(grouped.get(day) || []).length === 1 ? 'viagem' : 'viagens'}${holidaysByDay.has(day) ? `, feriado: ${holidaysByDay.get(day)!.map(h => `${h.name} (${h.scope})`).join(', ')}` : ''}`} onClick={() => setSelected(day)} onKeyDown={event => moveFocus(day, event)} className={`relative mx-auto min-h-10 w-full max-w-12 rounded-lg text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${selected === day ? (holidaysByDay.has(day) ? 'bg-blue-800 text-white' : 'bg-primary-700 text-white') : holidaysByDay.has(day) ? 'bg-blue-50 font-bold text-blue-800 hover:bg-blue-100' : grouped.has(day) ? 'bg-primary-50 font-semibold text-primary-900 hover:bg-primary-100' : [0, 6].includes(index % 7) ? 'bg-surface-50 text-surface-700 hover:bg-surface-100' : 'text-surface-800 hover:bg-surface-100'} ${day === localDay(new Date()) && selected !== day ? 'ring-1 ring-primary-600' : ''}`}>
            {Number(day.slice(-2))}<span className="absolute bottom-1 left-0 right-0 flex justify-center gap-1" aria-hidden="true">{grouped.has(day) && <span className={`h-1.5 w-1.5 rounded-full ${selected === day ? 'bg-white' : 'bg-primary-600'}`} />}{holidaysByDay.has(day) && <span className={`h-1.5 w-1.5 rounded-sm ${selected === day ? 'bg-white' : 'bg-blue-700'}`} />}</span>
          </button> : <span key={`empty-${index}`} aria-hidden="true" />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-600" aria-label="Legenda do calendário"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary-600" aria-hidden="true" />Viagem</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-sm bg-blue-700" aria-hidden="true" />Feriado</span></div>
        <div className="mt-3 rounded-xl bg-surface-50 p-3" aria-live="polite"><h4 className="text-sm font-semibold text-surface-900">Viagens em {selectedLabel}</h4>
          {loading ? <p className="mt-1 text-sm text-surface-600">Carregando…</p> : error ? <p className="mt-1 text-sm text-surface-600">As viagens não puderam ser carregadas.</p> : chosen.length === 0 ? <p className="mt-1 text-sm text-surface-600">Nenhuma viagem cadastrada para esta data.</p> : <ul className="mt-2 space-y-2">{chosen.map(trip => <li key={trip.id}><Link className="flex items-center justify-between gap-2 rounded-lg border border-surface-200 bg-white p-2.5 text-sm hover:border-primary-500 focus-visible:outline focus-visible:outline-2" to={`/trips/${trip.id}/edit`}><span className="min-w-0"><span className="block truncate font-semibold text-surface-900">{trip.title}</span><span className="block truncate text-xs text-surface-600">{[trip.city, trip.region].filter(Boolean).join(' · ')}</span></span><StatusBadge tone={tripStatusTone(trip.status)}>{tripStatusLabel(trip.status)}</StatusBadge></Link></li>)}</ul>}
        </div>
        <div className="mt-4 border-t border-surface-200 pt-4" aria-live="polite"><h4 className="text-sm font-semibold text-surface-900">Feriados e datas móveis em {label}</h4><p className="mt-1 text-xs text-surface-600">Feriados nacionais, estaduais da Paraíba e municipais de Campina Grande. Carnaval aparece à parte, com a classificação oficial quando disponível.</p>{holidays.length ? <ul className="mt-2 space-y-2">{holidays.map(holiday => <li key={`${holiday.date}-${holiday.name}`} className="flex items-start gap-2 text-sm text-blue-800"><span className="font-semibold tabular-nums">{holiday.date.slice(8, 10)}/{holiday.date.slice(5, 7)}</span><span><span className="font-medium">{holiday.name}</span> <span className="text-xs text-surface-600">· {holiday.scope}</span></span></li>)}</ul> : <p className="mt-2 text-sm text-surface-600">Nenhum feriado ou data móvel cadastrado para este mês.</p>}</div>
      </div>
    </section>
  );
}
