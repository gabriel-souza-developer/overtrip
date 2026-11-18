import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { listOrganizationVisits, type OrganizationVisit } from '../api/organizationVisits';
import type { OrganizationOutletContext } from './OrganizationLayout';
import { formatDateBR } from '../lib/dateInput';
import PageHeader from '../components/PageHeader';
import FilterBar from '../components/FilterBar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';

/** Listagem privada por empresa; a edição será habilitada após APIs próprias. */
export default function OrganizationVisits() {
  const { organization } = useOutletContext<OrganizationOutletContext>();
  const [visits, setVisits] = useState<OrganizationVisit[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [needsReview, setNeedsReview] = useState('');
  const [hasCoords, setHasCoords] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const load = useCallback(async (page = 1) => {
    const version = ++requestVersion.current;
    setLoading(true); setError(''); setVisits([]);
    try {
      const result = await listOrganizationVisits(organization.id, { page, limit: 20, search, needsReview, hasCoords });
      if (version === requestVersion.current) { setVisits(result.data); setPagination(result.pagination); }
    } catch (err) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'Não foi possível carregar os destinos visitados.');
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [organization.id, search, needsReview, hasCoords]);

  useEffect(() => { void load(1); return () => { requestVersion.current++; }; }, [load]);

  return <div className="space-y-6">
    <PageHeader title="Destinos visitados" description="Consulte os destinos registrados pela sua empresa." />
    <FilterBar searchLabel="Buscar destinos" searchPlaceholder="Buscar por nome, cidade ou estado" searchValue={search} onSearch={setSearch} hasFilters={!!search || !!needsReview || !!hasCoords} onClear={() => { setSearch(''); setNeedsReview(''); setHasCoords(''); }}>
      <select className="select w-full lg:w-48" aria-label="Filtrar por revisão" value={needsReview} onChange={event => setNeedsReview(event.target.value)}>
        <option value="">Todas as situações</option><option value="true">Precisam de revisão</option><option value="false">Revisados</option>
      </select>
      <select className="select w-full lg:w-48" aria-label="Filtrar por coordenadas" value={hasCoords} onChange={event => setHasCoords(event.target.value)}>
        <option value="">Todas as localizações</option><option value="true">Com coordenadas</option><option value="false">Sem coordenadas</option>
      </select>
    </FilterBar>
    {error && <ErrorState message={error} onRetry={() => void load(pagination.page)} />}
    {loading ? <p role="status" className="text-sm text-surface-600">Carregando destinos...</p> : !error && visits.length === 0
      ? <EmptyState icon={<MapPin />} title="Nenhum destino encontrado" text={search || needsReview || hasCoords ? 'Nenhum destino corresponde aos filtros selecionados.' : 'Esta empresa ainda não tem destinos registrados.'} />
      : !error && <div className="grid gap-3">{visits.map(visit => <article key={visit.id} className="card flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 space-y-1"><h2 className="font-semibold text-surface-900 break-words">{visit.title}</h2>
          <p className="text-sm text-surface-600">{visit.city} · {visit.region}{visit.date ? ` · ${formatDateBR(visit.date)}` : ''}</p>
          {visit.description && <p className="text-sm text-surface-600 break-words">{visit.description}</p>}
          <p className="text-xs text-surface-600">{visit.lat !== null && visit.lng !== null ? 'Coordenadas cadastradas' : 'Sem coordenadas'}</p>
        </div>
        <span className={visit.needsReview ? 'badge-warning' : 'badge-success'}>{visit.needsReview ? 'Precisa de revisão' : 'Revisado'}</span>
      </article>)}</div>}
    {!loading && !error && <Pagination pagination={pagination} onChange={page => void load(page)} />}
  </div>;
}
