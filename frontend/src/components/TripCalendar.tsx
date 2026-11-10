import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { tripApi } from '../api';
import { calendarDays, monthKey, tripsByDay, type CalendarTrip } from '../lib/tripCalendar';
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
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month);
  const selectedLabel = selected.split('-').reverse().join('/');
  const changeMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next); setSelected(`${monthKey(next)}-01`);
  };

  return (
    <section className="card overflow-hidden" aria-labelledby="calendario-title">
      <div className="px-5 py-4 border-b border-surface-200 flex flex-wrap items-center gap-3 justify-between">
        <div><h2 id="calendario-title" className="font-semibold text-lg text-surface-900 flex items-center gap-2"><CalendarDays aria-hidden="true" className="w-5 h-5 text-primary-700" /> Calendário de viagens</h2><p className="text-sm text-surface-600 mt-1">Selecione uma data para ver as viagens cadastradas.</p></div>
        <Link className="text-primary-700 text-sm font-semibold hover:underline" to="/trips">Ver todas as viagens</Link>
      </div>
      {error && <div className="p-4"><ErrorState message={error} onRetry={() => setAttempt(n => n + 1)} /></div>}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.8fr)]" aria-busy={loading}>
        <div className="p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <button type="button" className="p-2 rounded-lg hover:bg-surface-100 focus-visible:outline focus-visible:outline-2" onClick={() => changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
            <h3 className="font-semibold text-surface-900 capitalize" aria-live="polite">{label}</h3>
            <button type="button" className="p-2 rounded-lg hover:bg-surface-100 focus-visible:outline focus-visible:outline-2" onClick={() => changeMonth(1)} aria-label="Próximo mês"><ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-surface-600" aria-hidden="true">{weekdays.map(day => <span key={day} className="py-2">{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-y-1" role="group" aria-label={`Datas de ${label}`}>
            {days.map((day, index) => day ? <button key={day} type="button" aria-pressed={selected === day} aria-label={`${day.split('-').reverse().join('/')}, ${(grouped.get(day) || []).length} viagem(ns)`} onClick={() => setSelected(day)} className={`relative mx-auto w-full max-w-12 min-h-11 rounded-lg text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${selected === day ? 'bg-primary-600 text-white' : 'text-surface-800 hover:bg-surface-100'} ${day === localDay(new Date()) && selected !== day ? 'ring-1 ring-primary-600' : ''}`}>
              {Number(day.slice(-2))}{grouped.has(day) && <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${selected === day ? 'bg-white' : 'bg-primary-600'}`} aria-hidden="true" />}
            </button> : <span key={`empty-${index}`} aria-hidden="true" />)}
          </div>
          <p className="text-xs text-surface-600 mt-3">O ponto indica que há viagens na data.</p>
        </div>
        <div className="p-4 sm:p-5 bg-surface-50 lg:border-l border-t lg:border-t-0 border-surface-200">
          <h3 className="font-semibold text-surface-900">Viagens em {selectedLabel}</h3>
          {loading ? <p className="text-sm text-surface-600 mt-4" role="status">Carregando viagens…</p> : error ? <p className="text-sm text-surface-600 mt-4">As viagens não puderam ser carregadas.</p> : chosen.length === 0 ? <p className="text-sm text-surface-600 mt-4">Nenhuma viagem cadastrada para esta data.</p> : <ul className="mt-3 space-y-2">{chosen.map(trip => <li key={trip.id}><Link className="block rounded-lg border border-surface-200 bg-white p-3 hover:border-primary-500 focus-visible:outline focus-visible:outline-2" to={`/trips/${trip.id}/edit`}><span className="block font-semibold text-sm text-surface-900">{trip.title}</span><span className="block text-xs text-surface-600 mt-1">{[trip.city, trip.region].filter(Boolean).join(' - ')} · {tripStatusLabel(trip.status)}</span></Link></li>)}</ul>}
        </div>
      </div>
    </section>
  );
}
