import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Pencil, Plane, Ticket, UsersRound, type LucideIcon } from 'lucide-react';
import { organizationApi, type OrganizationDashboardSummary } from '../api/organizations';
import type { OrganizationOutletContext } from './OrganizationLayout';
import ErrorState from '../components/ErrorState';
import OrgTripCalendar from '../components/OrgTripCalendar';
import { capitalizeFirst } from '../lib/tripCalendar';

export default function OrganizationDashboard() {
  const { organization, role } = useOutletContext<OrganizationOutletContext>();
  const [summary, setSummary] = useState<OrganizationDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const canManage = role === 'OWNER' || role === 'ADMIN';
  const base = `/empresa/${encodeURIComponent(organization.id)}`;

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError(''); setSummary(null);
    try {
      const data = await organizationApi.dashboard(organization.id);
      if (version === requestVersion.current) setSummary(data);
    } catch (err) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'Não foi possível carregar o resumo.');
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [organization.id]);
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [load]);

  const today = capitalizeFirst(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));
  const cards: { label: string; value: number | undefined; detail: string; icon: LucideIcon; tone: string; to: string }[] = [
    { label: 'Próximas viagens', value: summary?.trips.upcoming, detail: 'De hoje em diante', icon: Plane, tone: 'bg-primary-50 text-primary-800', to: `${base}/trips?period=upcoming` },
    { label: 'Viagens abertas', value: summary?.trips.open, detail: 'Inclui datas passadas', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700', to: `${base}/trips?status=OPEN&period=all` },
    { label: 'Rascunhos', value: summary?.trips.drafts, detail: 'Viagens em preparação', icon: Pencil, tone: 'bg-amber-50 text-amber-700', to: `${base}/trips?status=DRAFT&period=all` },
    { label: 'Total de viagens', value: summary?.trips.total, detail: 'Todas as viagens da empresa', icon: Plane, tone: 'bg-surface-100 text-surface-700', to: `${base}/trips?period=all` },
  ];
  const actions = [
    { to: `${base}/trips`, icon: Plane, text: 'Organizar viagens', sub: canManage ? 'Crie e acompanhe seus rascunhos' : 'Consulte suas viagens' },
    ...(canManage ? [
      { to: `${base}/leads`, icon: UsersRound, text: 'Acompanhar interessados', sub: summary?.leads === undefined ? 'Consulte seus contatos' : `${summary.leads} ${summary.leads === 1 ? 'interessado' : 'interessados'}` },
      { to: `${base}/reservations`, icon: Ticket, text: 'Gerenciar reservas', sub: summary?.reservations === undefined ? 'Consulte suas reservas' : `${summary.reservations} ${summary.reservations === 1 ? 'reserva' : 'reservas'}` },
    ] : []),
  ];

  return <div className="space-y-7 pb-6">
    <header className="relative overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-white via-white to-primary-50 px-5 py-6 shadow-sm sm:px-7 sm:py-7">
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-600">Painel {organization.name}</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-surface-900">Visão geral</h1><p className="mt-1 text-sm text-surface-600">{today}</p></div>
        <Link to={`${base}/trips`} className="btn-primary min-h-11"><Plane className="h-4 w-4" aria-hidden="true" /> Ver viagens</Link>
      </div>
    </header>
    {error && <ErrorState message={error} onRetry={() => void load()} />}
    <section aria-labelledby="organization-summary-title">
      <h2 id="organization-summary-title" className="mb-3 text-lg font-bold text-surface-900">Resumo das viagens</h2>
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon, tone, to }) => <Link key={label} to={to} className="group rounded-2xl border border-surface-200 bg-white p-4 shadow-sm motion-safe:transition sm:p-5 hover:border-primary-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600" aria-label={`${label}: ${loading ? 'carregando' : value ?? 'indisponível'}. ${detail}`}>
          <div className="flex items-start justify-between gap-3"><span className="text-sm font-semibold leading-snug text-surface-700" aria-hidden="true">{label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span></div>
          {loading ? <span className="loading-skeleton mt-4 block h-8 w-12" aria-hidden="true" /> : <span className="mt-4 block text-3xl font-bold tracking-tight text-surface-900 tabular-nums" aria-hidden="true">{value ?? '—'}</span>}
          <span className="mt-2 block text-xs leading-snug text-surface-500" aria-hidden="true">{detail}</span>
        </Link>)}
      </div>
    </section>
    <OrgTripCalendar organizationId={organization.id} base={base} canManage={canManage} />
    <section aria-labelledby="organization-actions-title" className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 id="organization-actions-title" className="mb-4 text-lg font-bold text-surface-900">Ações rápidas</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{actions.map(({ to, icon: Icon, text, sub }) => <Link key={to} to={to} className="group flex min-h-20 items-center gap-3 rounded-xl border border-surface-200 p-4 motion-safe:transition hover:border-primary-300 hover:bg-primary-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-700"><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-surface-900">{text}</span><span className="mt-0.5 block text-xs text-surface-600">{sub}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-surface-400 group-hover:text-primary-600" aria-hidden="true" /></Link>)}</div>
    </section>
  </div>;
}
