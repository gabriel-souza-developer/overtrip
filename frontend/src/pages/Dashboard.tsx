import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BusFront, MapPin, Plus } from 'lucide-react';
import { tripApi, Trip } from '../api';
import ErrorState from '../components/ErrorState';
import TripCalendar from '../components/TripCalendar';
import SeasonalGuide from '../components/SeasonalGuide';
import StatusBadge from '../components/StatusBadge';
import { capitalizeFirst } from '../lib/tripCalendar';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { tripStatusLabel, tripStatusTone } from '../lib/panelHelpers';

const tripDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return {
    day: new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', ''),
    full: new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date),
  };
};

export default function Dashboard() {
  useDocumentTitle('Agenda de viagens');
  const [upcomingTrips, setUpcomingTrips] = useState<Trip[]>([]);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });

  const loadDashboard = async () => {
    setLoading(true); setError('');
    try {
      const upcoming = await tripApi.list({ period: 'upcoming', page: 1, limit: 100 });
      setUpcomingTrips(upcoming.data);
      setUpcomingCount(upcoming.pagination.total);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar a agenda.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadDashboard(); }, []);

  const today = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()));

  return (
    <main className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">OVERTRIP <span className="mx-1 text-surface-300" aria-hidden="true">/</span> Viagens</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-surface-900 sm:text-3xl">Agenda de viagens</h1>
          <p className="mt-1 text-sm text-surface-600">{today} <span className="mx-1.5 text-surface-300" aria-hidden="true">·</span> próximas viagens, calendário e clima em um só lugar</p>
        </div>
        <Link to="/trips/new" className="btn-primary min-h-11 shrink-0 justify-center"><Plus className="h-4 w-4" aria-hidden="true" /> Nova viagem</Link>
      </header>

      {error && <ErrorState message={error} onRetry={loadDashboard} />}

      <section aria-labelledby="proximas-viagens-title" className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-100 px-5 py-4 sm:px-6">
          <h2 id="proximas-viagens-title" className="text-lg font-bold text-surface-900">Próximas viagens <span className="ml-1 inline-flex min-w-7 items-center justify-center rounded-full bg-primary-50 px-2 py-0.5 text-sm font-semibold text-primary-900">{loading ? '—' : upcomingCount}</span></h2>
          <Link to="/trips?period=all" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary-800 hover:underline">Ver todas as viagens <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        {loading ? <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Carregando próximas viagens">{[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-surface-100" />)}</div>
          : upcomingTrips.length === 0 ? <div className="px-5 py-7 text-center sm:px-6"><BusFront className="mx-auto h-6 w-6 text-surface-400" aria-hidden="true" /><p className="mt-2 text-sm font-medium text-surface-800">Nenhuma viagem futura cadastrada.</p><p className="mt-1 text-sm text-surface-600">As viagens e as informações de clima continuam disponíveis abaixo.</p></div>
            : <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{upcomingTrips.slice(0, 4).map((trip) => {
              const date = tripDate(trip.startDateISO);
              const displayStatus = trip.status === 'DRAFT' ? 'Em preparação' : trip.status === 'OPEN' ? 'Inscrições abertas' : tripStatusLabel(trip.status);
              return <li key={trip.id}><Link to={`/trips/${trip.id}/edit`} aria-label={`${trip.title}, ${date.full}, ${trip.city}, ${displayStatus}`} className="group flex min-h-24 items-start gap-3 rounded-xl border border-surface-200 p-3 transition hover:border-primary-300 hover:bg-primary-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-50 text-primary-900"><span className="text-lg font-bold leading-none tabular-nums">{date.day}</span><span className="mt-1 text-[10px] font-bold uppercase">{date.month}</span></span>
                <span className="min-w-0 flex-1"><span className="block whitespace-normal break-words text-sm font-semibold leading-5 text-surface-900">{trip.title}</span><span className="mt-1 flex items-start gap-1 whitespace-normal break-words text-xs leading-4 text-surface-600"><MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{trip.city || trip.region}</span><StatusBadge className="mt-2" tone={tripStatusTone(trip.status)}>{displayStatus}</StatusBadge></span>
              </Link></li>;
            })}</ul>}
      </section>

      <section aria-labelledby="calendar-weather-title" className="space-y-3">
        <div><h2 id="calendar-weather-title" className="text-xl font-bold tracking-tight text-surface-900">Calendário e clima</h2><p className="mt-1 text-sm text-surface-600">Escolha um mês para consultar as viagens e ver como costuma ser o tempo.</p></div>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <TripCalendar month={calendarMonth} onMonthChange={setCalendarMonth} />
        <SeasonalGuide month={calendarMonth} plannedTrips={upcomingTrips} />
        </div>
      </section>

    </main>
  );
}
