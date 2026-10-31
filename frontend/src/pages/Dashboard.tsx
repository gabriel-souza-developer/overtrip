import React, { useEffect, useState } from 'react';
import { dashboardApi, DashboardStats } from '../api';
import { Link } from 'react-router-dom';

const statCards = [
  { key: 'tripsTotal', label: 'Total de Viagens', icon: TripsIcon, color: 'primary' },
  { key: 'tripsPublished', label: 'Publicadas', icon: PublishIcon, color: 'success' },
  { key: 'tripsDraft', label: 'Rascunhos', icon: DraftIcon, color: 'warning' },
  { key: 'visitsTotal', label: 'Total de Visitas', icon: VisitsIcon, color: 'info' },
  { key: 'visitsNeedsReview', label: 'Visitas a revisar', icon: ReviewIcon, color: 'danger' },
  { key: 'visitsWithCoords', label: 'Com local no mapa', icon: CoordsIcon, color: 'success' },
  { key: 'galleryTotal', label: 'Memórias da Galeria', icon: GalleryIcon, color: 'info' },
  { key: 'galleryFeatured', label: 'Em Destaque', icon: StarIcon, color: 'warning' },
] as const;

function TripsIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>;
}

function PublishIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
}

function DraftIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
}

function VisitsIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}

function ReviewIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
}

function CoordsIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>;
}

function GalleryIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
}

function StarIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;
}

function ArrowRightIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>;
}

const iconColors = {
  primary: 'bg-primary-100 text-primary-600',
  success: 'bg-green-100 text-green-600',
  warning: 'bg-yellow-100 text-yellow-600',
  danger: 'bg-red-100 text-red-600',
  info: 'bg-blue-100 text-blue-600',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await dashboardApi.stats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar estatísticas');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">Visão geral do painel administrativo</p>
        </div>
        <div className="stats-grid">
          {statCards.map(({ key }) => (
            <div key={key} className="stat-card">
              <div className="loading-skeleton h-8 w-1/3 rounded mb-2"></div>
              <div className="loading-skeleton h-4 w-2/3 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert-error" role="alert">
        {error}
        <button className="btn-secondary mt-2" onClick={loadStats}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">Visão geral do painel administrativo OVERTRIP</p>
      </div>

      <div className="stats-grid">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <Link key={key} to={getLinkForStat(key)} className="stat-card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="stat-label">{label}</p>
                <p className="stat-value">{stats ? stats[key as keyof DashboardStats] : 0}</p>
              </div>
              <div className={`p-3 rounded-xl ${iconColors[color]}`}>
                <Icon className="w-6 h-6" aria-hidden="true" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Quick actions */}
        <div className="card">
          <div className="p-6 border-b border-surface-200">
            <h2 className="text-lg font-semibold text-surface-900">Ações rápidas</h2>
          </div>
          <div className="p-6 space-y-3">
            <Link to="/trips/new" className="btn-secondary w-full justify-start gap-3 p-4 hover:bg-surface-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <span>Criar nova viagem</span>
            </Link>
            <Link to="/visits?needsReview=true" className="btn-secondary w-full justify-start gap-3 p-4 hover:bg-surface-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              <span>Revisar visitas pendentes ({stats?.visitsNeedsReview || 0})</span>
            </Link>
            <Link to="/gallery" className="btn-secondary w-full justify-start gap-3 p-4 hover:bg-surface-100 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Gerenciar galeria</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function getLinkForStat(key: string): string {
  const links: Record<string, string> = {
    tripsTotal: '/trips',
    tripsPublished: '/trips?status=OPEN',
    tripsDraft: '/trips?status=DRAFT',
    visitsTotal: '/visits',
    visitsNeedsReview: '/visits?needsReview=true',
    visitsWithCoords: '/visits?hasCoords=true',
    galleryTotal: '/gallery',
    galleryFeatured: '/gallery?isFeatured=true',
  };
  return links[key] || '/dashboard';
}
