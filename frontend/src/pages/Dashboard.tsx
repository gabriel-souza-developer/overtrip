import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Images, Pencil, Plane, Plus, type LucideIcon } from 'lucide-react';
import { dashboardApi, DashboardStats, tripApi } from '../api';
import ErrorState from '../components/ErrorState';
import TripCalendar from '../components/TripCalendar';
import { capitalizeFirst } from '../lib/tripCalendar';

type Tone = 'primary' | 'success' | 'warning' | 'danger';
const statsConfig: { key: keyof DashboardStats | 'tripsUpcoming'; label: string; icon: LucideIcon; tone: Tone; to: string; detail: string }[] = [
  { key: 'tripsUpcoming', label: 'Próximas viagens', icon: Plane, tone: 'primary', to: '/trips?period=upcoming', detail: 'Concluídas ficam em Anteriores' },
  { key: 'tripsPublished', label: 'Publicadas no site', icon: CheckCircle2, tone: 'success', to: '/trips?status=OPEN&period=all', detail: 'Viagens no site' },
  { key: 'tripsDraft', label: 'Rascunhos', icon: Pencil, tone: 'warning', to: '/trips?status=DRAFT&period=all', detail: 'Continuar preparando' },
  { key: 'visitsNeedsReview', label: 'Destinos para revisar', icon: AlertTriangle, tone: 'danger', to: '/visits?needsReview=true', detail: 'Revisar destinos' },
];
const toneClass: Record<Tone, string> = {
  primary: 'bg-primary-50 text-primary-500', success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700', danger: 'bg-rose-50 text-rose-700',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingTrips, setUpcomingTrips] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = async () => {
    setLoading(true); setError('');
    try {
      const [summary, upcoming] = await Promise.all([
        dashboardApi.stats(),
        tripApi.list({ period: 'upcoming', page: 1, limit: 1 }),
      ]);
      setStats(summary);
      setUpcomingTrips(upcoming.pagination.total);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar o resumo.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadStats(); }, []);
  const pending = stats?.visitsNeedsReview ?? 0;
  const today = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));

  return (
    <div className="space-y-7 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Painel OVERTRIP</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-surface-900">Visão geral</h1>
          <p className="mt-1 text-sm text-surface-600">{today} · Acompanhe suas viagens e próximos passos</p>
        </div>
        <Link to="/trips/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden="true" /> Nova viagem</Link>
      </header>

      {error && <ErrorState message={error} onRetry={loadStats} />}
      <section aria-label="Indicadores">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {statsConfig.map(({ key, label, icon: Icon, tone, to, detail }) => (
            <Link key={key} to={to} className="group rounded-2xl border border-surface-200 bg-white p-4 sm:p-5 shadow-sm transition hover:border-primary-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500" aria-label={`${label}: ${loading ? 'carregando' : key === 'tripsUpcoming' ? upcomingTrips ?? 'indisponível' : stats ? stats[key] : 'indisponível'}. ${detail}`}>
              <div className="flex items-start justify-between gap-2"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass[tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><ArrowRight className="h-4 w-4 text-surface-400 transition group-hover:translate-x-1" aria-hidden="true" /></div>
              {loading ? <span className="loading-skeleton mt-4 block h-8 w-12" aria-hidden="true" /> : <span className="mt-4 block text-3xl font-bold tracking-tight text-surface-900 tabular-nums" aria-hidden="true">{key === 'tripsUpcoming' ? upcomingTrips ?? '—' : stats ? stats[key] : '—'}</span>}
              <span className="mt-1 block text-sm font-medium text-surface-600" aria-hidden="true">{label}</span>
              {detail && <span className="mt-2 block text-xs leading-snug text-surface-500" aria-hidden="true">{detail}</span>}
            </Link>
          ))}
        </div>
      </section>

      <TripCalendar />

      <section aria-labelledby="acoes-title" className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="mb-4"><h2 id="acoes-title" className="text-lg font-bold text-surface-900">Ações rápidas</h2><p className="mt-1 text-sm text-surface-600">Acesse o que você mais usa no dia a dia.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { to: '/trips/new', icon: Plus, text: 'Criar viagem', sub: 'Comece um novo rascunho' },
            { to: '/visits?needsReview=true', icon: AlertTriangle, text: 'Revisar destinos', sub: stats ? `${pending} ${pending === 1 ? 'destino para revisar' : 'destinos para revisar'}` : 'Confira os destinos pendentes' },
            { to: '/gallery', icon: Images, text: 'Organizar galeria', sub: 'Fotos e memórias das viagens' },
          ].map(({ to, icon: Icon, text, sub }) => <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-surface-200 p-4 transition hover:border-primary-300 hover:bg-primary-50/50"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-700"><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-surface-900">{text}</span><span className="mt-0.5 block text-xs text-surface-600">{sub}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-surface-400 group-hover:text-primary-500" aria-hidden="true" /></Link>)}
        </div>
      </section>
    </div>
  );
}
