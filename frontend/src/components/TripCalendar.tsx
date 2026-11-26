import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { tripApi } from '../api';
import { calendarDays, capitalizeFirst, monthKey, saoPauloDateKey, tripsByDay, upcomingTrips, tripDay, type CalendarTrip } from '../lib/tripCalendar';
import { tripStatusLabel, tripStatusTone } from '../lib/panelHelpers';
import StatusBadge from './StatusBadge';
import ErrorState from './ErrorState';
import { holidaysForMonth } from '../lib/holidays';

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const initialMonth = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); };
const localDay = (date: Date) => `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Mês exibido pode ser controlado pelo Início (para a orientação sazonal acompanhar o calendário). */
export default function TripCalendar({ month: controlledMonth, onMonthChange }: { month?: Date; onMonthChange?: (month: Date) => void } = {}) {
  const [ownMonth, setOwnMonth] = useState(initialMonth);
  const month = controlledMonth ?? ownMonth;
  const setMonth = (next: Date) => { setOwnMonth(next); onMonthChange?.(next); };
  const [selected, setSelected] = useState(() => localDay(new Date()));
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
      } finally {
        if (active) setLoading(false);
      }
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
  // "Próxima" segue o dia de São Paulo (fuso da operação), não o do navegador.
  const upcoming = useMemo(() => upcomingTrips(trips, saoPauloDateKey()).slice(0, 4), [trips]);
  const label = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month));
  const selectedLabel = selected.split('-').reverse().join('/');
  const goTo = (next: Date) => {
    setMonth(next);
    const today = new Date();
    setSelected(monthKey(next) === monthKey(today) ? localDay(today) : `${monthKey(next)}-01`);
  };
  const changeMonth = (delta: number) => goTo(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const monthPrefix = `${monthKey(month)}-`;
  const monthTripCount = useMemo(() => [...grouped.entries()].filter(([day]) => day.startsWith(monthPrefix)).reduce((total, [, list]) => total + list.length, 0), [grouped, monthPrefix]);
  const tripYears = useMemo(() => trips.map(trip => Number(tripDay(trip.startDateISO).slice(0, 4))).filter(year => year >= 2000 && year <= 2100), [trips]);
  const currentYear = new Date().getFullYear();
  const firstYear = Math.min(currentYear - 2, month.getFullYear(), ...tripYears);
  const lastYear = Math.max(currentYear + 2, month.getFullYear(), ...tripYears);
  const yearChoices = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const isCurrentMonth = monthKey(month) === monthKey(new Date());

  return (
    <section aria-labelledby="calendario-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="calendario-title" className="text-lg font-bold text-surface-900">Agenda de viagens</h2>
        <Link className="text-sm font-semibold text-primary-800 hover:underline" to="/trips?period=all">Ver todas as viagens <ArrowRight className="inline h-4 w-4" aria-hidden="true" /></Link>
      </div>
      {error && <ErrorState message={error} onRetry={() => setAttempt(n => n + 1)} />}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.92fr)]" aria-busy={loading}>
        <div className="min-w-0 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-surface-900">Próximas viagens</h3><p className="mt-1 text-sm text-surface-600">Viagens a partir de hoje</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-800"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span></div>
          {loading ? <p className="mt-6 text-sm text-surface-600" role="status">Carregando viagens…</p> : error ? <p className="mt-6 text-sm text-surface-600">Não foi possível carregar as viagens.</p> : upcoming.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-surface-300 p-5"><p className="text-sm font-medium text-surface-800">Nenhuma viagem programada a partir de hoje.</p><Link to="/trips/new" className="mt-2 inline-block text-sm font-semibold text-primary-800 hover:underline">Criar viagem</Link><Link to="/trips?period=past" className="ml-4 mt-2 inline-block text-sm font-semibold text-primary-800 hover:underline">Ver viagens anteriores</Link></div> : <ul className="mt-4 divide-y divide-surface-100">{upcoming.map(trip => {
            const day = tripDay(trip.startDateISO);
            const dateLabel = day.split('-').reverse().join('/');
            return <li key={trip.id}><Link to={`/trips/${trip.id}/edit`} className="group flex min-h-20 items-center gap-3 rounded-lg py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"><span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-50 text-primary-800"><span className="text-lg font-bold leading-none">{Number(day.slice(-2))}</span><span className="mt-1 text-[10px] font-bold uppercase">{new Intl.DateTimeFormat('pt-BR', {month:'short'}).format(new Date(`${day}T12:00:00`)).replace('.', '')}</span></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-surface-900">{trip.title}</span><span className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-surface-600"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {[trip.city, trip.region].filter(Boolean).join(' - ')} <span aria-hidden="true">·</span> {dateLabel}</span></span><StatusBadge tone={tripStatusTone(trip.status)} className="hidden shrink-0 sm:inline-flex">{tripStatusLabel(trip.status)}</StatusBadge><ArrowRight className="h-4 w-4 shrink-0 text-surface-400 group-hover:text-primary-800" aria-hidden="true" /></Link></li>;
          })}</ul>}
        </div>
        <div className="min-w-0 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-surface-900">Calendário de viagens</h3><CalendarDays aria-hidden="true" className="h-5 w-5 text-primary-800" /></div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,6.5rem)_auto] items-center gap-2">
            <label className="sr-only" htmlFor="calendar-month">Mês do calendário</label>
            <select id="calendar-month" className="select min-h-10 py-1.5 text-sm" value={month.getMonth()} onChange={(event) => goTo(new Date(month.getFullYear(), Number(event.target.value), 1))}>
              {MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
            <label className="sr-only" htmlFor="calendar-year">Ano do calendário</label>
            <select id="calendar-year" className="select min-h-10 py-1.5 text-sm" value={month.getFullYear()} onChange={(event) => goTo(new Date(Number(event.target.value), month.getMonth(), 1))}>
              {yearChoices.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <button type="button" className="btn-secondary min-h-10 px-3 py-1.5 text-sm" onClick={() => goTo(initialMonth())} disabled={isCurrentMonth}>Hoje</button>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-primary-50 to-orange-50 px-1 py-1">
            <button type="button" className="rounded-lg p-2 hover:bg-white focus-visible:outline focus-visible:outline-2" onClick={() => changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
            <div className="text-center" aria-live="polite"><h4 className="font-semibold text-surface-900">{label}</h4><p className="text-xs text-surface-600">{loading ? 'Carregando…' : monthTripCount === 0 ? 'Nenhuma viagem no mês' : monthTripCount === 1 ? '1 viagem no mês' : `${monthTripCount} viagens no mês`}{holidays.length ? ` · ${holidays.length === 1 ? '1 feriado' : `${holidays.length} feriados`}` : ''}</p></div>
            <button type="button" className="rounded-lg p-2 hover:bg-white focus-visible:outline focus-visible:outline-2" onClick={() => changeMonth(1)} aria-label="Próximo mês"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <div className="mt-2 grid grid-cols-7 text-center text-xs font-semibold text-surface-600" aria-hidden="true">{weekdays.map((day, index) => <span key={day} className={`py-2 ${index === 0 || index === 6 ? 'text-primary-800' : ''}`}>{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-y-1" role="group" aria-label={`Datas de ${label}`}>
            {days.map((day, index) => day ? <button key={day} type="button" aria-pressed={selected === day} aria-label={`${day.split('-').reverse().join('/')}, ${(grouped.get(day) || []).length} viagem(ns)${holidaysByDay.has(day) ? `, feriado: ${holidaysByDay.get(day)!.map(h => `${h.name} (${h.scope})`).join(', ')}` : ''}`} onClick={() => setSelected(day)} className={`relative mx-auto min-h-11 w-full max-w-12 rounded-lg text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${selected === day ? (holidaysByDay.has(day) ? 'bg-blue-800 text-white' : 'bg-primary-600 text-white') : (holidaysByDay.has(day) ? 'bg-blue-50 font-bold text-blue-800 hover:bg-blue-100' : grouped.has(day) ? 'bg-primary-50 font-semibold text-primary-900 hover:bg-primary-100' : [0, 6].includes(index % 7) ? 'bg-surface-50 text-surface-800 hover:bg-surface-100' : 'text-surface-800 hover:bg-surface-100')} ${day === localDay(new Date()) && selected !== day ? 'ring-1 ring-primary-600' : ''}`}>
              {Number(day.slice(-2))}<span className="absolute bottom-1 left-0 right-0 flex justify-center gap-1" aria-hidden="true">{grouped.has(day) && (grouped.get(day)!.length > 1 ? <span className={`rounded-full px-1 text-[9px] font-bold leading-3 ${selected === day ? 'bg-white text-primary-800' : 'bg-primary-600 text-white'}`}>{grouped.get(day)!.length}</span> : <span className={`h-1.5 w-1.5 rounded-full ${selected === day ? 'bg-white' : 'bg-primary-500'}`} />)}{holidaysByDay.has(day) && <span className={`h-1.5 w-1.5 rounded-sm ${selected === day ? 'bg-white' : 'bg-blue-700'}`} />}</span>
            </button> : <span key={`empty-${index}`} aria-hidden="true" />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-600" aria-label="Legenda do calendário"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden="true" />Viagem</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-sm bg-blue-700" aria-hidden="true" />Feriado</span><span className="inline-flex items-center gap-1.5"><span className="rounded-full bg-primary-600 px-1 text-[9px] font-bold leading-3 text-white" aria-hidden="true">2</span>Mais de uma viagem</span></div>
          <div className="mt-4 border-t border-surface-200 pt-4" aria-live="polite"><h4 className="text-sm font-semibold text-surface-900">Feriados em {label}</h4>{holidays.length ? <ul className="mt-2 space-y-2">{holidays.map(holiday => <li key={`${holiday.date}-${holiday.name}`} className="flex items-start gap-2 text-sm text-blue-800"><span className="font-semibold tabular-nums">{holiday.date.slice(8, 10)}/{holiday.date.slice(5, 7)}</span><span><span className="font-medium">{holiday.name}</span> <span className="text-xs text-surface-600">· {holiday.scope}</span></span></li>)}</ul> : <p className="mt-2 text-sm text-surface-600">Nenhum feriado cadastrado para este mês.</p>}<p className="mt-2 text-xs text-surface-600">Brasil, Paraíba e Campina Grande. Datas recorrentes segundo as regras atuais; pontos facultativos não incluídos.</p></div>
          <div className="mt-4 rounded-xl bg-surface-50 p-4"><h4 className="text-sm font-semibold text-surface-900">Viagens em {selectedLabel}</h4>
            {loading ? <p className="mt-2 text-sm text-surface-600">Carregando viagens…</p> : error ? <p className="mt-2 text-sm text-surface-600">As viagens não puderam ser carregadas.</p> : chosen.length === 0 ? <p className="mt-2 text-sm text-surface-600">Nenhuma viagem cadastrada para esta data.</p> : <ul className="mt-2 space-y-2">{chosen.map(trip => <li key={trip.id}><Link className="block rounded-lg border border-surface-200 p-3 text-sm hover:border-primary-500 focus-visible:outline focus-visible:outline-2" to={`/trips/${trip.id}/edit`}><span className="flex flex-wrap items-center justify-between gap-2 font-semibold text-surface-900"><span>{trip.title}</span><StatusBadge tone={tripStatusTone(trip.status)}>{tripStatusLabel(trip.status)}</StatusBadge></span><span className="mt-1 block text-xs text-surface-600">{[trip.city, trip.region].filter(Boolean).join(' - ')}</span></Link></li>)}</ul>}
          </div>
        </div>
      </div>
    </section>
  );
}
