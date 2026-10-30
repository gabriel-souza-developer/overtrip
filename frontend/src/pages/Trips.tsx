import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { tripApi, Trip, TripStatus, Pagination } from '../api';
import { useToast } from '../hooks/useToast';

const statusOptions: { value: TripStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'OPEN', label: 'Publicada' },
  { value: 'COMPLETED', label: 'Concluída' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'SOLD_OUT', label: 'Esgotada' },
  { value: 'CLOSED', label: 'Fechada' },
];

const statusColors: Record<TripStatus, string> = {
  DRAFT: 'badge-neutral',
  OPEN: 'badge-success',
  COMPLETED: 'badge-info',
  CANCELLED: 'badge-danger',
  SOLD_OUT: 'badge-warning',
  CLOSED: 'badge-neutral',
};

function PlusIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
}

function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
}

function ChevronRightIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}

function MoreIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>;
}

function EditIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
}

function TrashIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}

function EyeIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
}

export default function Trips() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const status = searchParams.get('status') as TripStatus | null;
  const search = searchParams.get('search') || '';

  useEffect(() => {
    loadTrips();
  }, [page, status, search]);

  const loadTrips = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await tripApi.list({ page, limit: 20, status: status || undefined, search: search || undefined });
      setTrips(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar viagens');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const searchValue = formData.get('search') as string;
    const newParams = new URLSearchParams(searchParams);
    if (searchValue) newParams.set('search', searchValue);
    else newParams.delete('search');
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleStatusChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set('status', value);
    else newParams.delete('status');
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', String(newPage));
    setSearchParams(newParams);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Excluir a viagem "${title}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(id);
    try {
      await tripApi.delete(id);
      toast.success('Viagem excluída com sucesso');
      loadTrips();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir viagem');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePublish = async (trip: Trip) => {
    try {
      if (trip.status === 'OPEN') {
        await tripApi.unpublish(trip.id);
        toast.success('Viagem despublicada');
      } else {
        await tripApi.publish(trip.id);
        toast.success('Viagem publicada');
      }
      loadTrips();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar status');
    }
  };

  if (loading && trips.length === 0) {
    return (
      <div className="space-y-6">
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">Viagens</h1>
            <p className="page-description">Gerencie as viagens e experiências OVERTRIP</p>
          </div>
          <Link to="/trips/new" className="btn-primary">
            <PlusIcon className="w-5 h-5" aria-hidden="true" />
            Nova Viagem
          </Link>
        </div>
        <div className="table-container">
          <table className="table" role="table">
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col">Status</th>
                <th scope="col">Data Início</th>
                <th scope="col">Cidade/Região</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map(i => (
                <tr key={i}>
                  <td><div className="loading-skeleton h-4 w-3/4"></div></td>
                  <td><div className="loading-skeleton h-5 w-20 rounded-full"></div></td>
                  <td><div className="loading-skeleton h-4 w-24"></div></td>
                  <td><div className="loading-skeleton h-4 w-28"></div></td>
                  <td><div className="loading-skeleton h-8 w-24 rounded"></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Viagens</h1>
          <p className="page-description">Gerencie as viagens e experiências OVERTRIP</p>
        </div>
        <Link to="/trips/new" className="btn-primary">
          <PlusIcon className="w-5 h-5" aria-hidden="true" />
          Nova Viagem
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-0 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" aria-hidden="true" />
            <input
              type="search"
              name="search"
              className="input pl-10"
              placeholder="Buscar por título, cidade, categoria..."
              defaultValue={search}
              aria-label="Buscar viagens"
            />
          </div>
          <select
            name="status"
            className="select w-full sm:w-48"
            value={status || ''}
            onChange={(e) => handleStatusChange(e.target.value)}
            aria-label="Filtrar por status"
          >
            <option value="">Todos os status</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </form>
      </div>

      {error && (
        <div className="alert-error" role="alert">{error}</div>
      )}

      {/* Table */}
      <div className="card">
        <div className="table-container">
          <table className="table" role="table">
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col">Status</th>
                <th scope="col">Data Início</th>
                <th scope="col">Cidade/Região</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {trips.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-state py-8">
                    {search || status ? 'Nenhuma viagem encontrada com estes filtros' : 'Nenhuma viagem cadastrada'}
                  </td>
                </tr>
              ) : (
                trips.map(trip => (
                  <tr key={trip.id}>
                    <td className="font-medium text-surface-900">{trip.title}</td>
                    <td>
                      <span className={`${statusColors[trip.status]} ${trip.status === 'OPEN' ? 'font-medium' : ''}`}>
                        {statusOptions.find(s => s.value === trip.status)?.label || trip.status}
                      </span>
                    </td>
                    <td className="text-surface-600 whitespace-nowrap">
                      {new Date(trip.startDateISO).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className="text-surface-600">{trip.city}/{trip.region}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Link to={`/trips/${trip.id}/edit`} className="btn-ghost p-2" aria-label={`Editar ${trip.title}`}>
                          <EditIcon className="w-4 h-4" aria-hidden="true" />
                        </Link>
                        <button
                          onClick={() => handlePublish(trip)}
                          className={`btn-ghost p-2 ${trip.status === 'OPEN' ? 'text-green-600 hover:bg-green-50' : 'text-primary-600 hover:bg-primary-50'}`}
                          aria-label={trip.status === 'OPEN' ? `Despublicar ${trip.title}` : `Publicar ${trip.title}`}
                        >
                          {trip.status === 'OPEN' ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </button>
                        <div className="dropdown">
                          <button className="btn-ghost p-2" aria-label={`Mais opções para ${trip.title}`}>
                            <MoreIcon className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <div className="dropdown-menu" role="menu">
                            <Link to={`/trips/${trip.id}/edit`} className="dropdown-item flex items-center gap-2" role="menuitem">
                              <EditIcon className="w-4 h-4" aria-hidden="true" />
                              Editar
                            </Link>
                            <div className="dropdown-divider" role="separator" />
                            <button
                              className="dropdown-item text-red-600 flex items-center gap-2 w-full"
                              role="menuitem"
                              onClick={() => handleDelete(trip.id, trip.title)}
                              disabled={deletingId === trip.id}
                            >
                              <TrashIcon className="w-4 h-4" aria-hidden="true" />
                              {deletingId === trip.id ? 'Excluindo...' : 'Excluir'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-surface-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-surface-500">
                Mostrando {((pagination.page - 1) * pagination.limit) + 1} a {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} resultados
              </p>
              <div className="pagination">
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  aria-label="Página anterior"
                >
                  <ChevronLeftIcon className="w-4 h-4" aria-hidden="true" />
                </button>
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 5) pageNum = i + 1;
                  else if (pagination.page <= 3) pageNum = i + 1;
                  else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                  else pageNum = pagination.page - 2 + i;
                  return (
                    <button
                      key={pageNum}
                      className={`pagination-btn ${pagination.page === pageNum ? 'pagination-btn-active' : ''}`}
                      onClick={() => handlePageChange(pageNum)}
                      aria-label={`Página ${pageNum}`}
                      aria-current={pagination.page === pageNum ? 'page' : undefined}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  className="pagination-btn"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  aria-label="Próxima página"
                >
                  <ChevronRightIcon className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}