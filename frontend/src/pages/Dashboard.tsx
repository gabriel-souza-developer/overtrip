import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, Image as ImageIcon, MapPin, MapPinned, Pencil, Plane, Plus, Star, type LucideIcon } from 'lucide-react';
import { dashboardApi, DashboardStats } from '../api';
import PageHeader from '../components/PageHeader';
import ErrorState from '../components/ErrorState';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

const statCards: { key: keyof DashboardStats; label: string; icon: LucideIcon; tone: Tone; to: string }[] = [
  { key: 'tripsTotal', label: 'Viagens', icon: Plane, tone: 'primary', to: '/trips' },
  { key: 'tripsPublished', label: 'No site', icon: CheckCircle2, tone: 'success', to: '/trips?status=OPEN' },
  { key: 'tripsDraft', label: 'Rascunhos', icon: Pencil, tone: 'warning', to: '/trips?status=DRAFT' },
  { key: 'visitsTotal', label: 'Visitas', icon: MapPin, tone: 'info', to: '/visits' },
  { key: 'visitsNeedsReview', label: 'Visitas para revisar', icon: AlertTriangle, tone: 'danger', to: '/visits?needsReview=true' },
  { key: 'visitsWithCoords', label: 'Visitas no mapa', icon: MapPinned, tone: 'success', to: '/visits?hasCoords=true' },
  { key: 'galleryTotal', label: 'Memórias na galeria', icon: ImageIcon, tone: 'info', to: '/gallery' },
  { key: 'galleryFeatured', label: 'Em destaque', icon: Star, tone: 'warning', to: '/gallery?isFeatured=true' },
];

const toneClass: Record<Tone, string> = {
  primary: 'bg-primary-100 text-primary-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = async () => {
    setLoading(true);
    setError('');
    try {
      setStats(await dashboardApi.stats());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o resumo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const pending = stats?.visitsNeedsReview ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Início" description="Resumo do que está acontecendo no site OVERTRIP" />

      {error ? <ErrorState message={error} onRetry={loadStats} /> : null}

      <section aria-label="Resumo" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map(({ key, label, icon: Icon, tone, to }) => (
          <Link key={key} to={to} className="card p-4 sm:p-5 hover:shadow-md transition-shadow flex flex-col gap-3" aria-label={`${label}: ${stats ? stats[key] : 'carregando'}. Ver lista`}>
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneClass[tone]}`}>
              <Icon className="w-5 h-5" aria-hidden="true" />
            </span>
            {loading ? (
              <span className="loading-skeleton h-8 w-1/3 block" aria-hidden="true" />
            ) : (
              <span className="text-3xl font-bold text-surface-900 tabular-nums" aria-hidden="true">{stats ? stats[key] : '—'}</span>
            )}
            <span className="text-sm text-surface-600" aria-hidden="true">{label}</span>
          </Link>
        ))}
      </section>

      <section className="card" aria-labelledby="acoes">
        <h2 id="acoes" className="text-lg font-semibold text-surface-900 px-5 py-4 border-b border-surface-200">O que você quer fazer?</h2>
        <ul className="divide-y divide-surface-100">
          {[
            { to: '/trips/new', icon: Plus, text: 'Criar uma viagem', sub: 'Só precisa de nome, local, data, valor e foto' },
            { to: '/visits?needsReview=true', icon: AlertTriangle, text: `Revisar visitas${pending ? ` (${pending})` : ''}`, sub: 'Confira as visitas que ainda esperam revisão' },
            { to: '/gallery', icon: ImageIcon, text: 'Cuidar da galeria', sub: 'Adicione fotos e escolha o destaque' },
          ].map(({ to, icon: Icon, text, sub }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-4 px-5 py-4 min-h-[64px] hover:bg-surface-50">
                <Icon className="w-5 h-5 text-primary-700 shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-surface-900">{text}</span>
                  <span className="block text-sm text-surface-600">{sub}</span>
                </span>
                <ChevronRight className="w-5 h-5 text-surface-500 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
