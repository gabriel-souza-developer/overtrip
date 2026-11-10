import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { tripApi } from '../api';
import { calendarDays, capitalizeFirst, monthKey, saoPauloDateKey, tripsByDay, upcomingTrips, tripDay, type CalendarTrip } from '../lib/tripCalendar';
import { tripStatusLabel } from '../lib/panelHelpers';
import ErrorState from './ErrorState';

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const initialMonth = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); };
const localDay = (date: Date) => `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;

export default function TripCalendar() {
  const [month, setMonth] = useState(initialMonth);
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
  const chosen = grouped.get(selected) || [];
  // "Próxima" segue o dia de São Paulo (fuso da operação), não o do navegador.
  const upcoming = useMemo(() => upcomingTrips(trips, saoPauloDateKey()).slice(0, 4), [trips]);
  const label = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month));
  const selectedLabel = selected.split('-').reverse().join('/');
  const changeMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next); setSelected(`${monthKey(next)}-01`);
  };

  return (
    <section aria-labelledby="calendario-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="calendario-title" className="text-lg font-bold text-surface-900">Agenda de viagens</h2><p className="mt-1 text-sm text-surface-600">Acompanhe suas próximas saídas e datas importantes.</p></div>
        <Link className="text-sm font-semibold text-primary-500 hover:underline" to="/trips?period=all">Ver todas as viagens <ArrowRight className="inline h-4 w-4" aria-hidden="true" /></Link>
      </div>
      {error && <ErrorState message={error} onRetry={() => setAttempt(n => n + 1)} />}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.92fr)]" aria-busy={loading}>
        <div className="min-w-0 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-surface-900">Próximas viagens</h3><p className="mt-1 text-sm text-surface-600">Viagens a partir de hoje</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-500"><CalendarDays className="h-5 w-5" aria-hidden="true" /></span></div>
          {loading ? <p className="mt-6 text-sm text-surface-600" role="status">Carregando viagens…</p> : error ? <p className="mt-6 text-sm text-surface-600">Não foi possível carregar as viagens.</p> : upcoming.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-surface-300 p-5"><p className="text-sm font-medium text-surface-800">Nenhuma viagem futura cadastrada.</p><Link to="/trips/new" className="mt-2 inline-block text-sm font-semibold text-primary-500 hover:underline">Criar viagem</Link><Link to="/trips?period=past" className="ml-4 mt-2 inline-block text-sm font-semibold text-primary-500 hover:underline">Ver viagens anteriores</Link></div> : <ul className="mt-4 divide-y divide-surface-100">{upcoming.map(trip => {
            const day = tripDay(trip.startDateISO);
            const dateLabel = day.split('-').reverse().join('/');
            return <li key={trip.id}><Link to={`/trips/${trip.id}/edit`} className="group flex items-center gap-3 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"><span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-50 text-primary-500"><span className="text-lg font-bold leading-none">{Number(day.slice(-2))}</span><span className="mt-1 text-[10px] font-bold uppercase">{new Intl.DateTimeFormat('pt-BR', {month:'short'}).format(new Date(`${day}T12:00:00`)).replace('.', '')}</span></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-surface-900">{trip.title}</span><span className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-surface-600"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {[trip.city, trip.region].filter(Boolean).join(' - ')} <span aria-hidden="true">·</span> {dateLabel}</span></span><span className="hidden rounded-full bg-surface-100 px-2.5 py-1 text-xs font-semibold text-surface-700 sm:block">{tripStatusLabel(trip.status)}</span><ArrowRight className="h-4 w-4 shrink-0 text-surface-400 group-hover:text-primary-500" aria-hidden="true" /></Link></li>;
          })}</ul>}
        </div>
        <div className="min-w-0 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-surface-900">Calendário de viagens</h3><CalendarDays aria-hidden="true" className="h-5 w-5 text-primary-500" /></div>
          <div className="mt-4 flex items-center justify-between">
            <button type="button" className="rounded-lg p-2 hover:bg-surface-100 focus-visible:outline focus-visible:outline-2" onClick={() => changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
            <h4 className="font-semibold text-surface-900" aria-live="polite">{label}</h4>
            <button type="button" className="rounded-lg p-2 hover:bg-surface-100 focus-visible:outline focus-visible:outline-2" onClick={() => changeMonth(1)} aria-label="Próximo mês"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-surface-600" aria-hidden="true">{weekdays.map(day => <span key={day} className="py-2">{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-y-1" role="group" aria-label={`Datas de ${label}`}>
            {days.map((day, index) => day ? <button key={day} type="button" aria-pressed={selected === day} aria-label={`${day.split('-').reverse().join('/')}, ${(grouped.get(day) || []).length} viagem(ns)`} onClick={() => setSelected(day)} className={`relative mx-auto min-h-11 w-full max-w-12 rounded-lg text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${selected === day ? 'bg-primary-500 text-white' : 'text-surface-800 hover:bg-surface-100'} ${day === localDay(new Date()) && selected !== day ? 'ring-1 ring-primary-500' : ''}`}>
              {Number(day.slice(-2))}{grouped.has(day) && <span className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${selected === day ? 'bg-white' : 'bg-primary-500'}`} aria-hidden="true" />}
            </button> : <span key={`empty-${index}`} aria-hidden="true" />)}
          </div>
          <div className="mt-4 border-t border-surface-100 pt-4"><h4 className="text-sm font-semibold text-surface-900">Viagens em {selectedLabel}</h4>
            {loading ? <p className="mt-2 text-sm text-surface-600">Carregando viagens…</p> : error ? <p className="mt-2 text-sm text-surface-600">As viagens não puderam ser carregadas.</p> : chosen.length === 0 ? <p className="mt-2 text-sm text-surface-600">Nenhuma viagem cadastrada para esta data.</p> : <ul className="mt-2 space-y-2">{chosen.map(trip => <li key={trip.id}><Link className="block rounded-lg border border-surface-200 p-3 text-sm hover:border-primary-500 focus-visible:outline focus-visible:outline-2" to={`/trips/${trip.id}/edit`}><span className="block font-semibold text-surface-900">{trip.title}</span><span className="mt-1 block text-xs text-surface-600">{[trip.city, trip.region].filter(Boolean).join(' - ')} · {tripStatusLabel(trip.status)}</span></Link></li>)}</ul>}
          </div>
        </div>
      </div>
    </section>
  );
}
