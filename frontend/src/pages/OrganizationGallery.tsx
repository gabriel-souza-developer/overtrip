import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Images } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { listOrganizationGallery, type OrganizationGalleryEntry } from '../api/organizationGallery';
import type { OrganizationOutletContext } from './OrganizationLayout';
import { formatDateBR } from '../lib/dateInput';
import PageHeader from '../components/PageHeader';
import FilterBar from '../components/FilterBar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';

export default function OrganizationGallery() {
  const { organization } = useOutletContext<OrganizationOutletContext>();
  const [entries, setEntries] = useState<OrganizationGalleryEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [isFeatured, setIsFeatured] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const load = useCallback(async (page = 1) => {
    const version = ++requestVersion.current;
    setLoading(true); setError(''); setEntries([]);
    try {
      const result = await listOrganizationGallery(organization.id, { page, limit: 20, search, isFeatured });
      if (version === requestVersion.current) { setEntries(result.data); setPagination(result.pagination); }
    } catch (err) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'Não foi possível carregar a galeria de memórias.');
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [organization.id, search, isFeatured]);
  useEffect(() => { void load(1); return () => { requestVersion.current++; }; }, [load]);

  return <div className="space-y-6">
    <PageHeader title="Galeria de memórias" description="Consulte as memórias registradas pela sua empresa." />
    <FilterBar searchLabel="Buscar memórias" searchPlaceholder="Buscar por título ou descrição" searchValue={search} onSearch={setSearch} hasFilters={!!search || !!isFeatured} onClear={() => { setSearch(''); setIsFeatured(''); }}>
      <select className="select w-full lg:w-48" aria-label="Filtrar por destaque" value={isFeatured} onChange={event => setIsFeatured(event.target.value)}>
        <option value="">Todos os destaques</option><option value="true">Em destaque</option><option value="false">Sem destaque</option>
      </select>
    </FilterBar>
    {error && <ErrorState message={error} onRetry={() => void load(pagination.page)} />}
    {loading ? <p role="status" className="text-sm text-surface-600">Carregando memórias...</p> : !error && entries.length === 0
      ? <EmptyState icon={<Images />} title="Nenhuma memória encontrada" text={search || isFeatured ? 'Nenhuma memória corresponde aos filtros selecionados.' : 'Esta empresa ainda não tem memórias registradas.'} />
      : !error && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{entries.map(entry => <article key={entry.id} className="card overflow-hidden">
        {entry.images[0] ? <img className="h-40 w-full object-cover" src={entry.images[0].src} alt={entry.images[0].alt} loading="lazy" /> : <div className="flex h-40 items-center justify-center bg-surface-100 text-surface-500" aria-label="Imagem indisponível"><Images className="h-8 w-8" aria-hidden="true" /></div>}
        <div className="space-y-2 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-semibold text-surface-900 break-words">{entry.title}</h2>{entry.isFeatured && <span className="badge-warning">Em destaque</span>}</div>
          <p className="text-xs text-surface-600">{entry.dateDisplay || formatDateBR(entry.date)}</p><p className="text-sm text-surface-600 break-words">{entry.description}</p></div>
      </article>)}</div>}
    {!loading && !error && <Pagination pagination={pagination} onChange={page => void load(page)} />}
  </div>;
}
