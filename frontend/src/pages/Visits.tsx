import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { visitApi, Visit, Pagination } from '../api';
import { localInputToIso } from '../lib/dateInput';
import { visitToEditForm } from '../lib/visitForm';
import { useToast } from '../hooks/useToast';

type TripOption = NonNullable<Visit['trip']>;

function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
}

function ChevronRightIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}

function EditIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
}

function TrashIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}

function LinkIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
}

function UnlinkIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
}

function MapPinIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>;
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
}

export default function Visits() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Visit>>({});
  const [associatingId, setAssociatingId] = useState<string | null>(null);
  const { toast } = useToast();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const needsReview = searchParams.get('needsReview') === 'true' ? true : searchParams.get('needsReview') === 'false' ? false : undefined;
  const tripId = searchParams.get('tripId') || undefined;
  const city = searchParams.get('city') || undefined;
  const region = searchParams.get('region') || undefined;
  const hasCoords = searchParams.get('hasCoords') === 'true' ? true : searchParams.get('hasCoords') === 'false' ? false : undefined;
  const search = searchParams.get('search') || '';

  useEffect(() => {
    loadVisits();
    loadTripsForSelect();
  }, [page, needsReview, tripId, city, region, hasCoords, search]);

  const loadVisits = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await visitApi.list({ 
        page, 
        limit: 20, 
        needsReview, 
        tripId, 
        city: city || undefined, 
        region: region || undefined, 
        hasCoords,
        search: search || undefined 
      });
      setVisits(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar visitas');
    } finally {
      setLoading(false);
    }
  };

  const loadTripsForSelect = async () => {
    try {
      const data = await visitApi.list({ limit: 100 });
      // Get trips from visits that have trips associated
      const tripMap = new Map<string, TripOption>();
      data.data.forEach(v => {
        if (v.trip) tripMap.set(v.trip.id, v.trip);
      });
      setTrips(Array.from(tripMap.values()));
    } catch {
      // Ignore error
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

  const handleFilterChange = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set(key, value);
    else newParams.delete(key);
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', String(newPage));
    setSearchParams(newParams);
  };

  const startEdit = (visit: Visit) => {
    setEditingId(visit.id);
    setEditForm(visitToEditForm(visit));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id: string) => {
    try {
      await visitApi.update(id, { ...editForm, date: localInputToIso(editForm.date) });
      toast.success('Visita atualizada');
      cancelEdit();
      loadVisits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Excluir a visita "${title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await visitApi.delete(id);
      toast.success('Visita excluída');
      loadVisits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  };

  const associateWithTrip = async (visitId: string, selectedTripId: string) => {
    setAssociatingId(visitId);
    try {
      await visitApi.associate(visitId, selectedTripId || null);
      toast.success(selectedTripId ? 'Visita associada à viagem' : 'Associação removida');
      loadVisits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao associar');
    } finally {
      setAssociatingId(null);
    }
  };

  const showAssociateModal = (visit: Visit) => {
    setEditingId(visit.id);
    setEditForm(visitToEditForm(visit));
  };

  if (loading && visits.length === 0) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="page-title">Visitas</h1>
          <p className="page-description">Gerencie visitas e associações com viagens</p>
        </div>
        <div className="table-container">
          <table className="table" role="table">
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col">Cidade/Região</th>
                <th scope="col">Data</th>
                <th scope="col">Coordenadas</th>
                <th scope="col">Revisão</th>
                <th scope="col">Viagem</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map(i => (
                <tr key={i}>
                  <td><div className="loading-skeleton h-4 w-3/4"></div></td>
                  <td><div className="loading-skeleton h-4 w-28"></div></td>
                  <td><div className="loading-skeleton h-4 w-24"></div></td>
                  <td><div className="loading-skeleton h-5 w-12 rounded-full"></div></td>
                  <td><div className="loading-skeleton h-5 w-24 rounded-full"></div></td>
                  <td><div className="loading-skeleton h-4 w-32"></div></td>
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
      <div className="page-header">
        <h1 className="page-title">Visitas</h1>
        <p className="page-description">Gerencie visitas e associações manuais com viagens</p>
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
              placeholder="Buscar por título, cidade, origem..."
              defaultValue={search}
              aria-label="Buscar visitas"
            />
          </div>
          <select name="needsReview" className="select w-full sm:w-48" value={needsReview !== undefined ? String(needsReview) : ''} onChange={(e) => handleFilterChange('needsReview', e.target.value)} aria-label="Filtrar por revisão">
            <option value="">Todas</option>
            <option value="true">Pendentes de revisão</option>
            <option value="false">Revisadas</option>
          </select>
          <select name="hasCoords" className="select w-full sm:w-48" value={hasCoords !== undefined ? String(hasCoords) : ''} onChange={(e) => handleFilterChange('hasCoords', e.target.value)} aria-label="Filtrar por coordenadas">
            <option value="">Todas</option>
            <option value="true">Com coordenadas</option>
            <option value="false">Sem coordenadas</option>
          </select>
          <select name="city" className="select w-full sm:w-48" value={city || ''} onChange={(e) => handleFilterChange('city', e.target.value)} aria-label="Filtrar por cidade">
            <option value="">Todas as cidades</option>
            {Array.from(new Set(visits.map(v => v.city).filter(Boolean))).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </form>
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}

      {/* Table */}
      <div className="card">
        <div className="table-container">
          <table className="table" role="table">
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col">Cidade/Região</th>
                <th scope="col">Data</th>
                <th scope="col">Coordenadas</th>
                <th scope="col">Revisão</th>
                <th scope="col">Viagem Associada</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state py-8">
                    {search || needsReview !== undefined || hasCoords !== undefined || city ? 'Nenhuma visita encontrada com estes filtros' : 'Nenhuma visita cadastrada'}
                  </td>
                </tr>
              ) : (
                visits.map(visit => {
                  const isEditing = editingId === visit.id;
                  return (
                    <React.Fragment key={visit.id}>
                      <tr>
                        <td className="font-medium text-surface-900">{visit.title}</td>
                        <td className="text-surface-600">{visit.city}/{visit.region}</td>
                        <td className="text-surface-600 whitespace-nowrap">
                          {visit.date ? new Date(visit.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                        </td>
                        <td>
                          {visit.lat !== null && visit.lng !== null ? (
                            <span className="badge badge-success flex items-center gap-1">
                              <MapPinIcon className="w-3 h-3" aria-hidden="true" />
                              Sim
                            </span>
                          ) : (
                            <span className="badge badge-neutral">Não</span>
                          )}
                        </td>
                        <td>
                          {visit.needsReview ? (
                            <span className="badge badge-warning flex items-center gap-1">
                              <AlertTriangleIcon className="w-3 h-3" aria-hidden="true" />
                              Pendente
                            </span>
                          ) : (
                            <span className="badge badge-success">Revisada</span>
                          )}
                        </td>
                        <td>
                          {visit.trip ? (
                            <span className="text-surface-700">{visit.trip.title} <span className="text-surface-400">({visit.trip.status})</span></span>
                          ) : (
                            <span className="text-surface-400">—</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            {isEditing ? (
                              <>
                                <button className="btn-ghost p-2 text-green-600 hover:bg-green-50" onClick={() => saveEdit(visit.id)} aria-label="Salvar alterações">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </button>
                                <button className="btn-ghost p-2" onClick={cancelEdit} aria-label="Cancelar edição">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </>
                            ) : (
                              <>
                                <button className="btn-ghost p-2" onClick={() => startEdit(visit)} aria-label={`Editar ${visit.title}`}>
                                  <EditIcon className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <button className="btn-ghost p-2" onClick={() => showAssociateModal(visit)} aria-label={`Associar viagem ${visit.title}`}>
                                  {visit.tripId ? <UnlinkIcon className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                                </button>
                                <button className="btn-ghost p-2 text-red-600 hover:bg-red-50" onClick={() => handleDelete(visit.id, visit.title)} aria-label={`Excluir ${visit.title}`}>
                                  <TrashIcon className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr className="bg-surface-50">
                          <td colSpan={7} className="p-0">
                            <div className="p-4 border-t border-surface-200">
                              <form onSubmit={(e) => { e.preventDefault(); saveEdit(editingId!); }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <input type="hidden" name="id" value={editingId} />
                                <div className="form-group sm:col-span-2">
                                  <label htmlFor="edit-title" className="label">Título</label>
                                  <input id="edit-title" name="title" className="input" value={editForm.title} onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                  <label htmlFor="edit-city" className="label">Cidade</label>
                                  <input id="edit-city" name="city" className="input" value={editForm.city} onChange={(e) => setEditForm(prev => ({ ...prev, city: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                  <label htmlFor="edit-region" className="label">Região</label>
                                  <input id="edit-region" name="region" className="input" value={editForm.region} onChange={(e) => setEditForm(prev => ({ ...prev, region: e.target.value }))} required />
                                </div>
                                <div className="form-group">
                                  <label htmlFor="edit-date" className="label">Data</label>
                                  <input id="edit-date" name="date" type="datetime-local" className="input" value={editForm.date} onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value || null }))} />
                                </div>
                                <div className="form-group">
                                  <label htmlFor="edit-lat" className="label">Latitude</label>
                                  <input id="edit-lat" name="lat" type="number" step="any" min="-90" max="90" className="input" value={editForm.lat ?? ''} onChange={(e) => setEditForm(prev => ({ ...prev, lat: e.target.value ? parseFloat(e.target.value) : null }))} />
                                  <p className="text-xs text-surface-500 mt-1">Graus decimais, com ponto. Ex.: -7.115</p>
                                </div>
                                <div className="form-group">
                                  <label htmlFor="edit-lng" className="label">Longitude</label>
                                  <input id="edit-lng" name="lng" type="number" step="any" min="-180" max="180" className="input" value={editForm.lng ?? ''} onChange={(e) => setEditForm(prev => ({ ...prev, lng: e.target.value ? parseFloat(e.target.value) : null }))} />
                                  <p className="text-xs text-surface-500 mt-1">Graus decimais, com ponto. Ex.: -36.830</p>
                                </div>
                                <div className="form-group sm:col-span-2">
                                  <label htmlFor="edit-notes" className="label">Notas</label>
                                  <textarea id="edit-notes" name="notes" className="input" value={editForm.notes} onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
                                </div>
                                <div className="form-group">
                                  <label className="checkbox-label">
                                    <input name="needsReview" type="checkbox" className="checkbox-input" checked={editForm.needsReview} onChange={(e) => setEditForm(prev => ({ ...prev, needsReview: e.target.checked }))} />
                                    <span className="text-sm text-surface-700">Precisa de revisão</span>
                                  </label>
                                </div>
                                {editForm.tripId !== undefined && (
                                  <div className="form-group sm:col-span-2">
                                    <label htmlFor="edit-tripId" className="label">Viagem</label>
                                    <select id="edit-tripId" name="tripId" className="select" value={editForm.tripId} onChange={(e) => setEditForm(prev => ({ ...prev, tripId: e.target.value || null }))}>
                                      <option value="">— Sem viagem —</option>
                                      {trips.map(t => (
                                        <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                <div className="form-group sm:col-span-4 flex justify-end gap-2 pt-4 border-t border-surface-200">
                                  <button type="button" className="btn-secondary" onClick={cancelEdit}>Cancelar</button>
                                  <button type="submit" className="btn-primary">Salvar</button>
                                </div>
                              </form>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
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
                <button className="pagination-btn" onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1} aria-label="Página anterior"><ChevronLeftIcon className="w-4 h-4" /></button>
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 5) pageNum = i + 1;
                  else if (pagination.page <= 3) pageNum = i + 1;
                  else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                  else pageNum = pagination.page - 2 + i;
                  return <button key={pageNum} className={`pagination-btn ${pagination.page === pageNum ? 'pagination-btn-active' : ''}`} onClick={() => handlePageChange(pageNum)} aria-label={`Página ${pageNum}`} aria-current={pagination.page === pageNum ? 'page' : undefined}>{pageNum}</button>;
                })}
                <button className="pagination-btn" onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page === pagination.totalPages} aria-label="Próxima página"><ChevronRightIcon className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}