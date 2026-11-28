import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Compass, ExternalLink, Link2, Pencil, Plus, Trash2, Unlink, X } from 'lucide-react';
import {
  DESTINATION_CATEGORIES, OUTING_STATUS_LABELS, STATUS_LABELS, TRAIL_LABELS, destinationApi,
  type Destination, type DestinationFilters, type DestinationOuting, type DestinationStatus, type EffectiveOutingStatus, type OutingStatus, type TrailLevel,
} from '../api/destinations';
import {
  destinationToForm, emptyDestinationForm, emptyOutingForm, formToDestinationInput, formToOutingInput, formatMoney, outingSourceLabel, outingToForm, previewOuting, stopOnlyInput,
  type DestinationForm, type OutingForm,
} from '../lib/destinationBank';
import { formatDateBR } from '../lib/dateInput';
import PageHeader from '../components/PageHeader';
import FilterBar from '../components/FilterBar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Field from '../components/Field';
import ConfirmDialog from '../components/ConfirmDialog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const STATUS_BADGE: Record<DestinationStatus, string> = { IDEA: 'badge-neutral', PRIORITY: 'badge-info', DISCARDED: 'badge-warning' };
const FILTERABLE_STATUS: DestinationStatus[] = ['PRIORITY', 'DISCARDED'];
const OUTING_BADGE: Record<EffectiveOutingStatus, string> = { PLANNED: 'badge-info', REALIZED: 'badge-success', CANCELLED: 'badge-warning', UNCONFIRMED: 'badge-warning' };
const outingDateLabel = (outing: DestinationOuting) => (outing.date ? formatDateBR(outing.date) : 'data não informada');
function Summary({ destination }: { destination: Destination }) {
  const { summary } = destination;
  if (summary.outingsCount === 0) return <p className="text-xs text-surface-600">{destination.site.visits.length ? 'Já está em Destinos visitados · nenhuma saída lançada ainda' : 'Ainda não visitado'}</p>;
  const parts = [
    `${summary.outingsCount === 1 ? '1 registro' : `${summary.outingsCount} registros`}${summary.lastOutingDate ? ` · último em ${formatDateBR(summary.lastOutingDate)}` : ''}`,
    summary.averagePassengers !== null ? `média de ${summary.averagePassengers} pessoas` : null,
    summary.averagePricePerPersonCents !== null ? `preço médio ${formatMoney(summary.averagePricePerPersonCents)} por pessoa` : null,
    summary.averageResultCents !== null ? `resultado médio ${formatMoney(summary.averageResultCents)}` : null,
  ].filter(Boolean);
  return <p className="text-xs text-surface-600">{parts.join(' · ')}</p>;
}

export default function DestinationBank({ history = false }: { history?: boolean }) {
  useDocumentTitle(history ? 'Histórico de saídas' : 'Destinos a conhecer');
  const [rows, setRows] = useState<Destination[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState<DestinationFilters>({ sort: 'name' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const [editing, setEditing] = useState<Destination | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<DestinationForm>(emptyDestinationForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState<Destination | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [outingTarget, setOutingTarget] = useState<{ destination: Destination; outing: DestinationOuting | null } | null>(null);
  const [outingForm, setOutingForm] = useState<OutingForm>(emptyOutingForm);
  const [outingError, setOutingError] = useState('');
  const [outingSaving, setOutingSaving] = useState(false);
  const [outingToDelete, setOutingToDelete] = useState<{ destination: Destination; outing: DestinationOuting } | null>(null);

  // Viagem com vários destinos: juntar outra saída/destino à saída principal.
  const [joining, setJoining] = useState<{ destination: Destination; outing: DestinationOuting } | null>(null);
  const [joinSearch, setJoinSearch] = useState('');
  const [joinResults, setJoinResults] = useState<Destination[]>([]);
  const [joinBusy, setJoinBusy] = useState<string | null>(null);
  const [joinError, setJoinError] = useState('');
  const [detaching, setDetaching] = useState<{ destination: Destination; outing: DestinationOuting } | null>(null);
  const [detachBusy, setDetachBusy] = useState(false);

  const load = useCallback(async (page = 1) => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const result = await destinationApi.list({ ...filters, visited: history ? 'true' : 'false', page, limit: 30 });
      if (version === requestVersion.current) { setRows(result.data); setPagination(result.pagination); }
    } catch (err) {
      if (version === requestVersion.current) { setRows([]); setError(err instanceof Error ? err.message : 'Não foi possível carregar o banco de destinos.'); }
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [filters, history]);
  useEffect(() => { void load(1); return () => { requestVersion.current++; }; }, [load]);

  const setFilter = (key: keyof DestinationFilters, value: string) => setFilters((previous) => ({ ...previous, [key]: value }));
  const hasFilters = !!(filters.search || filters.status || filters.category || filters.trailLevel || filters.visited || filters.maxDistanceKm || filters.onMap);
  const replaceRow = (next: Destination) => setRows((previous) => previous.map((row) => (row.id === next.id ? next : row)));

  const openCreate = () => { setEditing(null); setCreating(true); setForm(emptyDestinationForm()); setFormError(''); };
  const openEdit = (destination: Destination) => { setCreating(false); setEditing(destination); setForm(destinationToForm(destination)); setFormError(''); };
  const closeForm = () => { if (!saving) { setCreating(false); setEditing(null); } };
  const patch = (changes: Partial<DestinationForm>) => setForm((previous) => ({ ...previous, ...changes }));

  const save = async () => {
    if (saving) return;
    const { data, error: validation } = formToDestinationInput(form);
    if (!data) { setFormError(validation ?? 'Revise os campos.'); return; }
    setSaving(true); setFormError('');
    try {
      if (editing) replaceRow(await destinationApi.update(editing.id, { ...data, expectedUpdatedAt: editing.updatedAt }));
      else { await destinationApi.create(data); await load(1); }
      setCreating(false); setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar o destino.');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true); setDeleteError('');
    try {
      await destinationApi.remove(toDelete.id);
      setToDelete(null);
      await load(rows.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir o destino.');
    } finally { setDeleting(false); }
  };

  const openOuting = (destination: Destination, outing: DestinationOuting | null) => {
    setOutingTarget({ destination, outing }); setOutingForm(outing ? outingToForm(outing) : emptyOutingForm()); setOutingError('');
  };
  const parsedOuting = formToOutingInput(outingForm);
  const outingPreview = parsedOuting.data ? previewOuting(parsedOuting.data) : null;

  const saveOuting = async () => {
    if (!outingTarget || outingSaving) return;
    if (!parsedOuting.data) { setOutingError(parsedOuting.error ?? 'Revise os campos.'); return; }
    setOutingSaving(true); setOutingError('');
    try {
      const { destination, outing } = outingTarget;
      // Numa parada, só data e observações: situação e valores ficam na principal.
      const updated = outing
        ? await destinationApi.updateOuting(destination.id, outing.id, (outing.parentOutingId ? stopOnlyInput(parsedOuting.data) : parsedOuting.data) as typeof parsedOuting.data)
        : await destinationApi.addOuting(destination.id, parsedOuting.data);
      setOutingTarget(null);
      if (!history && !outing) await load(pagination.page);
      else replaceRow(updated);
    } catch (err) {
      setOutingError(err instanceof Error ? err.message : 'Não foi possível salvar a saída.');
    } finally { setOutingSaving(false); }
  };

  const removeOuting = async () => {
    if (!outingToDelete) return;
    try {
      await destinationApi.removeOuting(outingToDelete.destination.id, outingToDelete.outing.id);
      setOutingToDelete(null);
      await load(pagination.page);
    } catch (err) {
      setOutingToDelete(null);
      setError(err instanceof Error ? err.message : 'Não foi possível excluir a saída.');
    }
  };

  useEffect(() => {
    if (!joining) return;
    let active = true;
    const term = joinSearch.trim();
    if (term.length < 2) { setJoinResults([]); return; }
    const timer = window.setTimeout(() => {
      destinationApi.list({ search: term, limit: 10 })
        .then((result) => { if (active) setJoinResults(result.data); })
        .catch((err) => { if (active) setJoinError(err instanceof Error ? err.message : 'Não foi possível buscar destinos.'); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [joining, joinSearch]);

  const openJoin = (destination: Destination, outing: DestinationOuting) => { setJoining({ destination, outing }); setJoinSearch(''); setJoinResults([]); setJoinError(''); };
  const join = async (body: { outingId: string } | { destinationId: string }, key: string) => {
    if (!joining || joinBusy) return;
    setJoinBusy(key); setJoinError('');
    try {
      await destinationApi.addStop(joining.destination.id, joining.outing.id, body);
      setJoining(null);
      await load(pagination.page);
    } catch (err) { setJoinError(err instanceof Error ? err.message : 'Não foi possível juntar.'); }
    finally { setJoinBusy(null); }
  };
  const detach = async () => {
    const trip = detaching?.outing.trip;
    if (!detaching || !trip?.primaryDestinationId || !trip.primaryOutingId || detachBusy) return;
    setDetachBusy(true);
    try {
      await destinationApi.removeStop(trip.primaryDestinationId, trip.primaryOutingId, detaching.outing.id);
      setDetaching(null);
      await load(pagination.page);
    } catch (err) { setDetaching(null); setError(err instanceof Error ? err.message : 'Não foi possível separar a parada.'); }
    finally { setDetachBusy(false); }
  };
  const joinDay = joining?.outing.date?.slice(0, 10) ?? null;
  const inTrip = new Set(joining?.outing.trip?.destinations.map((item) => item.id) ?? (joining ? [joining.destination.id] : []));
  const isStopForm = !!outingTarget?.outing?.parentOutingId;

  return <div className="space-y-6">
    <PageHeader
      title={history ? 'Histórico de saídas' : 'Destinos a conhecer'}
      description={history ? 'Consulte e corrija os registros usados no financeiro. Registros criados pelo site precisam de conferência; vários pontos no mesmo dia podem pertencer à mesma viagem.' : 'Ideias de lugares ainda não visitados: sem saída realizada e fora de Destinos visitados. Ao registrar uma saída realizada, o destino passa para o histórico.'}
      actions={<>
        {!history && <Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate}>Novo destino</Button>}
      </>}
    />
    <FilterBar searchLabel="Buscar destinos" searchPlaceholder="Buscar por nome ou cidade" searchValue={filters.search ?? ''} onSearch={(value) => setFilter('search', value)} hasFilters={hasFilters} onClear={() => setFilters({ sort: filters.sort })}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[44rem] lg:shrink-0">
      <select className="select w-full" aria-label="Filtrar por situação" value={filters.status ?? ''} onChange={(event) => setFilter('status', event.target.value)}>
        <option value="">Situação: todas</option>{FILTERABLE_STATUS.map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
      </select>
      <select className="select w-full" aria-label="Filtrar por tipo" value={filters.category ?? ''} onChange={(event) => setFilter('category', event.target.value)}>
        <option value="">Tipo: todos</option>{DESTINATION_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      <select className="select w-full" aria-label="Filtrar por nível da trilha" value={filters.trailLevel ?? ''} onChange={(event) => setFilter('trailLevel', event.target.value)}>
        <option value="">Nível: todos</option>{(Object.keys(TRAIL_LABELS) as TrailLevel[]).map((key) => <option key={key} value={key}>{TRAIL_LABELS[key]}</option>)}
      </select>
      <select className="select w-full" aria-label="Filtrar por distância" value={filters.maxDistanceKm ?? ''} onChange={(event) => setFilter('maxDistanceKm', event.target.value)}>
        <option value="">Distância: todas</option><option value="50">Até 50 km</option><option value="100">Até 100 km</option><option value="200">Até 200 km</option>
      </select>
      <select className="select w-full" aria-label="Ordenar" value={filters.sort ?? 'name'} onChange={(event) => setFilter('sort', event.target.value)}>
        <option value="name">De A a Z</option><option value="distance">Mais perto</option><option value="recent">Recentes</option>
      </select>
      </div>
    </FilterBar>

    {error && <ErrorState message={error} onRetry={() => void load(pagination.page)} />}
    {loading ? <p role="status" className="text-sm text-surface-600">Carregando destinos...</p> : !error && rows.length === 0
      ? <EmptyState icon={<Compass />} title="Nenhum destino encontrado" text={hasFilters ? 'Nenhum destino corresponde aos filtros selecionados.' : history ? 'Nenhuma saída registrada.' : 'Cadastre ideias de lugares para as próximas viagens.'} action={!hasFilters && !history ? <Button variant="primary" onClick={openCreate}>Novo destino</Button> : undefined} />
      : !error && <div className="grid gap-3">{rows.map((destination) => {
        const open = expanded === destination.id;
        const place = [destination.city, destination.region].filter(Boolean).join(' · ');
        const facts = [
          destination.distanceKm !== null ? `${destination.distanceKm} km${destination.originCity ? ` de ${destination.originCity}` : ''}` : null,
          destination.trailLevel ? `Trilha ${TRAIL_LABELS[destination.trailLevel].toLocaleLowerCase('pt-BR')}` : null,
          destination.bestSeason ? `Melhor época: ${destination.bestSeason}` : null,
        ].filter(Boolean);
        return <article key={destination.id} className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="font-semibold text-surface-900 break-words">{destination.name}</h2>
              {(place || destination.category) && <p className="text-sm text-surface-600">{[destination.category, place].filter(Boolean).join(' · ')}</p>}
              {facts.length > 0 && <p className="text-sm text-surface-600">{facts.join(' · ')}</p>}
              {history && <Summary destination={destination} />}
              {destination.links.length > 0 && <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">{destination.links.map((link) => <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline">{link.label}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span></a>
              </li>)}</ul>}
            </div>
            <div className="flex items-center gap-2">
              {history && destination.site.onMap && <span className="badge-success">No mapa do site</span>}
              {destination.status !== 'IDEA' && <span className={STATUS_BADGE[destination.status]}>{STATUS_LABELS[destination.status]}</span>}
              <Button small icon={<Pencil className="w-4 h-4" aria-hidden="true" />} onClick={() => openEdit(destination)} aria-label={`Editar ${destination.name}`}><span className="hidden sm:inline">Editar</span></Button>
              <button type="button" className="btn-icon text-red-700 hover:bg-red-50" onClick={() => { setDeleteError(''); setToDelete(destination); }} aria-label={`Excluir ${destination.name}`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
            </div>
          </div>
          <button type="button" className="btn-ghost mt-3 -ml-2" aria-expanded={open} aria-controls={`destination-details-${destination.id}`} onClick={() => setExpanded(open ? null : destination.id)}>
            {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />} {open ? 'Ocultar detalhes' : history ? 'Ver notas e saídas' : 'Ver notas e registrar saída'}
          </button>
          {open && <div id={`destination-details-${destination.id}`} className="mt-3 space-y-4 border-t border-surface-200 pt-4">
            <div><h3 className="text-sm font-semibold text-surface-900">Notas da equipe</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-surface-700 break-words">{destination.notes || 'Sem notas.'}</p></div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-surface-900">Saídas registradas</h3>
                <Button small icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={() => openOuting(destination, null)}>Registrar saída</Button>
              </div>
              {destination.outings.length === 0 ? <p className="mt-2 text-sm text-surface-600">Nenhuma saída registrada.</p> : <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <caption className="sr-only">Saídas realizadas para {destination.name}</caption>
                  <thead className="text-xs uppercase text-surface-600"><tr>
                    <th scope="col" className="py-2 pr-3">Data</th><th scope="col" className="py-2 pr-3">Pessoas</th><th scope="col" className="py-2 pr-3">Por pessoa</th>
                    <th scope="col" className="py-2 pr-3">Despesa</th><th scope="col" className="py-2 pr-3">Resultado</th><th scope="col" className="py-2 pr-3">Transporte</th><th scope="col" className="py-2"><span className="sr-only">Ações</span></th>
                  </tr></thead>
                  <tbody className="divide-y divide-surface-200">{destination.outings.map((outing) => <tr key={outing.id}>
                    <td className="py-2 pr-3">{outing.date ? formatDateBR(outing.date) : 'Sem data'}{outing.onSite && <span className="ml-2 badge-info">no site</span>}
                      {outing.effectiveStatus && <span className={`ml-2 ${OUTING_BADGE[outing.effectiveStatus]}`}>{OUTING_STATUS_LABELS[outing.effectiveStatus]}</span>}
                      {outing.statusConfirmed === false && outing.effectiveStatus === 'REALIZED' && <span className="block text-xs text-surface-600">Registro histórico · situação não confirmada</span>}
                      {outing.trip && <span className="block text-xs text-surface-700">{outing.trip.role === 'stop'
                        ? (outing.trip.destinations.length ? `Parada da viagem com ${outing.trip.destinations.filter((item) => item.id !== destination.id).map((item) => item.name).join(', ')} · situação e valores na saída de ${outing.trip.destinations[0].name}` : 'Parada de uma viagem fora do seu acesso')
                        : `Viagem com ${outing.trip.destinations.slice(1).map((item) => item.name).join(', ')} · valores registrados aqui, uma vez`}</span>}
                      {outingSourceLabel(outing.source) && <span className="block text-xs text-surface-500">Origem: {outingSourceLabel(outing.source)}</span>}
                      {outing.notes && <span className="block text-xs text-surface-600">{outing.notes}</span>}</td>
                    <td className="py-2 pr-3 tabular-nums">{outing.passengers ?? '—'}{outing.courtesySeats ? <span className="block text-xs text-surface-600">{outing.courtesySeats === 1 ? '1 cortesia' : `${outing.courtesySeats} cortesias`}</span> : null}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatMoney(outing.pricePerPersonCents)}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatMoney(outing.expenseCents)}</td>
                    <td className={`py-2 pr-3 tabular-nums font-medium ${outing.resultCents !== null && outing.resultCents < 0 ? 'text-red-700' : 'text-surface-900'}`}>{formatMoney(outing.resultCents)}</td>
                    <td className="py-2 pr-3">{outing.supplier ?? '—'}</td>
                    <td className="py-2"><div className="flex justify-end gap-1">
                      {outing.trip?.role === 'stop'
                        ? outing.trip.primaryOutingId && <button type="button" className="btn-icon" onClick={() => setDetaching({ destination, outing })} aria-label={`Separar a saída de ${outingDateLabel(outing)} da viagem`} title="Separar da viagem"><Unlink className="h-4 w-4" aria-hidden="true" /></button>
                        : <button type="button" className="btn-icon" onClick={() => openJoin(destination, outing)} aria-label={`Juntar outro destino à saída de ${outingDateLabel(outing)}`} title="Juntar outro destino (mesma viagem)"><Link2 className="h-4 w-4" aria-hidden="true" /></button>}
                      <button type="button" className="btn-icon" onClick={() => openOuting(destination, outing)} aria-label={`Editar saída de ${outing.date ? formatDateBR(outing.date) : 'data não informada'}`}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                      <button type="button" className="btn-icon text-red-700 hover:bg-red-50" onClick={() => setOutingToDelete({ destination, outing })} aria-label={`Excluir saída de ${outing.date ? formatDateBR(outing.date) : 'data não informada'}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </div></td>
                  </tr>)}</tbody>
                </table>
                <p className="mt-2 text-xs text-surface-600">Despesa = transporte + taxas extras. Resultado = (pessoas − cortesias) × valor por pessoa − despesa. Valores lançados à mão.</p>
              </div>}
            </div>
          </div>}
        </article>;
      })}</div>}
    {!loading && !error && <Pagination pagination={pagination} onChange={(page) => void load(page)} />}

    <Modal
      open={creating || !!editing}
      onOpenChange={(open) => { if (!open) closeForm(); }}
      title={creating ? 'Novo destino' : 'Editar destino'}
      description="Uso interno da equipe. Não aparece no site nem no assistente."
      widthClass="max-w-2xl"
      footer={<><Button onClick={closeForm} disabled={saving}>Cancelar</Button><Button variant="primary" loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar</Button></>}
    >
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate className="space-y-4">
        {formError && <div className="alert-error" role="alert">{formError}</div>}
        <Field id="destination-name" label="Nome do destino" required>
          <input id="destination-name" className="input" value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Ex.: Cachoeira do Roncador" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_7rem]">
          <Field id="destination-city" label="Cidade"><input id="destination-city" className="input" value={form.city} onChange={(event) => patch({ city: event.target.value })} /></Field>
          <Field id="destination-region" label="UF"><input id="destination-region" className="input" maxLength={2} value={form.region} onChange={(event) => patch({ region: event.target.value })} placeholder="PB" /></Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="destination-category" label="Tipo">
            <select id="destination-category" className="select" value={form.category} onChange={(event) => patch({ category: event.target.value as DestinationForm['category'] })}>
              <option value="">Não informado</option>{DESTINATION_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </Field>
          <Field id="destination-status" label="Situação">
            <select id="destination-status" className="select" value={form.status} onChange={(event) => patch({ status: event.target.value as DestinationStatus })}>
              {(Object.keys(STATUS_LABELS) as DestinationStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="destination-origin" label="Saindo de"><input id="destination-origin" className="input" value={form.originCity} onChange={(event) => patch({ originCity: event.target.value })} /></Field>
          <Field id="destination-distance" label="Distância (km)"><input id="destination-distance" className="input" inputMode="numeric" value={form.distanceKm} onChange={(event) => patch({ distanceKm: event.target.value })} /></Field>
          <Field id="destination-trail" label="Nível da trilha">
            <select id="destination-trail" className="select" value={form.trailLevel} onChange={(event) => patch({ trailLevel: event.target.value as DestinationForm['trailLevel'] })}>
              <option value="">Não informado</option>{(Object.keys(TRAIL_LABELS) as TrailLevel[]).map((key) => <option key={key} value={key}>{TRAIL_LABELS[key]}</option>)}
            </select>
          </Field>
        </div>
        <Field id="destination-season" label="Melhor época"><input id="destination-season" className="input" value={form.bestSeason} onChange={(event) => patch({ bestSeason: event.target.value })} placeholder="Ex.: Inverno, depois das chuvas" /></Field>
        <Field id="destination-notes" label="Notas da equipe" hint="Acesso, trilha, estrutura do local, cuidados. Não aparece no site.">
          <textarea id="destination-notes" className="input" rows={5} value={form.notes} onChange={(event) => patch({ notes: event.target.value })} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="label">Links (Google Maps, Wikiloc, redes)</legend>
          {form.links.map((link, index) => <div key={index} className="grid grid-cols-[8rem_1fr_auto] gap-2">
            <input className="input" aria-label={`Nome do link ${index + 1}`} value={link.label} onChange={(event) => patch({ links: form.links.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)) })} placeholder="Google Maps" />
            <input className="input" type="url" aria-label={`Endereço do link ${index + 1}`} value={link.url} onChange={(event) => patch({ links: form.links.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)) })} placeholder="https://" />
            <button type="button" className="btn-icon" onClick={() => patch({ links: form.links.filter((_, i) => i !== index) })} aria-label={`Remover link ${index + 1}`}><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>)}
          {form.links.length < 6 && <Button small icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={() => patch({ links: [...form.links, { label: '', url: '' }] })}>Adicionar link</Button>}
        </fieldset>
      </form>
    </Modal>

    <Modal
      open={!!outingTarget}
      onOpenChange={(open) => { if (!open && !outingSaving) setOutingTarget(null); }}
      title={outingTarget?.outing ? 'Editar saída' : 'Registrar saída'}
      description={outingTarget ? `${outingTarget.destination.name}. Valores lançados à mão; nada é cobrado ou pago por aqui.` : undefined}
      widthClass="max-w-xl"
      footer={<><Button onClick={() => setOutingTarget(null)} disabled={outingSaving}>Cancelar</Button><Button variant="primary" loading={outingSaving} loadingText="Salvando..." onClick={() => void saveOuting()}>Salvar</Button></>}
    >
      <form onSubmit={(event) => { event.preventDefault(); void saveOuting(); }} noValidate className="space-y-4">
        {outingError && <div className="alert-error" role="alert">{outingError}</div>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="outing-date" label="Data"><input id="outing-date" type="date" className="input" value={outingForm.date} onChange={(event) => setOutingForm({ ...outingForm, date: event.target.value })} /></Field>
          {!isStopForm && <Field id="outing-status" label="Situação" hint="Só saídas realizadas entram no financeiro.">
            <select id="outing-status" className="select" value={outingForm.status} onChange={(event) => setOutingForm({ ...outingForm, status: event.target.value as OutingStatus | '' })}>
              <option value="">Não confirmada</option>{(['PLANNED', 'REALIZED', 'CANCELLED'] as OutingStatus[]).map((key) => <option key={key} value={key}>{OUTING_STATUS_LABELS[key]}</option>)}
            </select>
          </Field>}
        </div>
        {isStopForm && <p className="rounded-xl bg-surface-50 p-3 text-sm text-surface-700">Esta saída é uma parada de uma viagem com vários destinos. Situação, passageiros e valores ficam na saída principal; aqui só a data e as observações.</p>}
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isStopForm ? 'hidden' : ''}`}>
          <Field id="outing-passengers" label="Passageiros" hint="Total de pessoas, incluindo cortesias."><input id="outing-passengers" className="input" inputMode="numeric" value={outingForm.passengers} onChange={(event) => setOutingForm({ ...outingForm, passengers: event.target.value })} /></Field>
          <Field id="outing-courtesy" label="Cortesias" hint="Pessoas que não pagam. Em branco conta como zero."><input id="outing-courtesy" className="input" inputMode="numeric" value={outingForm.courtesySeats} onChange={(event) => setOutingForm({ ...outingForm, courtesySeats: event.target.value })} /></Field>
          <Field id="outing-price" label="Valor por pessoa (R$)"><input id="outing-price" className="input" inputMode="decimal" value={outingForm.pricePerPerson} onChange={(event) => setOutingForm({ ...outingForm, pricePerPerson: event.target.value })} placeholder="65,00" /></Field>
          <Field id="outing-transport" label="Transporte (R$)"><input id="outing-transport" className="input" inputMode="decimal" value={outingForm.transportCost} onChange={(event) => setOutingForm({ ...outingForm, transportCost: event.target.value })} /></Field>
          <Field id="outing-extra" label="Taxas extras (R$)" hint="Entradas, guia, estacionamento."><input id="outing-extra" className="input" inputMode="decimal" value={outingForm.extraCost} onChange={(event) => setOutingForm({ ...outingForm, extraCost: event.target.value })} /></Field>
          <Field id="outing-supplier" label="Transporte contratado"><input id="outing-supplier" className="input" value={outingForm.supplier} onChange={(event) => setOutingForm({ ...outingForm, supplier: event.target.value })} /></Field>
        </div>
        {!isStopForm && <p className="text-xs text-surface-600">Se um dos custos estiver preenchido, o outro em branco conta como zero. Para registrar uma saída sem custos, informe zero.</p>}
        <Field id="outing-notes" label="Observações"><textarea id="outing-notes" className="input" rows={2} value={outingForm.notes} onChange={(event) => setOutingForm({ ...outingForm, notes: event.target.value })} /></Field>
        {outingPreview && !isStopForm && <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-50 p-3 text-sm" aria-live="polite">
          <div><dt className="text-xs text-surface-600">Receita</dt><dd className="font-semibold tabular-nums">{formatMoney(outingPreview.revenueCents)}</dd></div>
          <div><dt className="text-xs text-surface-600">Despesa</dt><dd className="font-semibold tabular-nums">{formatMoney(outingPreview.expenseCents)}</dd></div>
          <div><dt className="text-xs text-surface-600">Resultado</dt><dd className="font-semibold tabular-nums">{formatMoney(outingPreview.resultCents)}</dd></div>
        </dl>}
      </form>
    </Modal>

    <Modal
      open={!!joining}
      onOpenChange={(open) => { if (!open && !joinBusy) setJoining(null); }}
      title="Juntar destinos na mesma viagem"
      description={joining ? `Saída principal: ${joining.destination.name}${joining.outing.date ? `, ${formatDateBR(joining.outing.date)}` : ''}. Situação e valores ficam só nela e contam uma vez.` : undefined}
      widthClass="max-w-xl"
      footer={<Button onClick={() => setJoining(null)} disabled={!!joinBusy}>Fechar</Button>}
    >
      <div className="space-y-3">
        {joinError && <div className="alert-error" role="alert">{joinError}</div>}
        <Field id="join-search" label="Buscar o outro destino"><input id="join-search" className="input" value={joinSearch} onChange={(event) => setJoinSearch(event.target.value)} placeholder="Ex.: Fortaleza" autoComplete="off" /></Field>
        <p className="text-xs text-surface-600">Uma saída já registrada no outro destino só pode ser juntada se não tiver valores diferentes dos da principal; nada é apagado.</p>
        <ul className="divide-y divide-surface-200">{joinResults.filter((item) => !inTrip.has(item.id)).map((item) => {
          const sameDay = item.outings.filter((outing) => !outing.parentOutingId && !outing.trip && joinDay !== null && outing.date?.slice(0, 10) === joinDay);
          return <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 font-medium text-surface-900">{item.name}{item.city ? <span className="block text-xs font-normal text-surface-600">{item.city}</span> : null}</span>
            <span className="flex flex-wrap gap-2">
              {sameDay.map((outing) => <Button key={outing.id} small loading={joinBusy === outing.id} loadingText="Juntando..." onClick={() => void join({ outingId: outing.id }, outing.id)}>Juntar saída de {formatDateBR(outing.date!)}</Button>)}
              {sameDay.length === 0 && <Button small loading={joinBusy === item.id} loadingText="Juntando..." onClick={() => void join({ destinationId: item.id }, item.id)}>Acrescentar à viagem</Button>}
            </span>
          </li>;
        })}</ul>
      </div>
    </Modal>
    <ConfirmDialog
      open={!!detaching}
      onOpenChange={(open) => { if (!open && !detachBusy) setDetaching(null); }}
      title="Separar esta parada da viagem?"
      description="A saída volta a ser independente, sem valores (eles continuam na saída principal). Nada é apagado."
      confirmLabel="Separar"
      busyLabel="Separando..."
      busy={detachBusy}
      onConfirm={() => void detach()}
    />
    <ConfirmDialog
      open={!!toDelete}
      onOpenChange={(open) => { if (!open && !deleting) { setToDelete(null); setDeleteError(''); } }}
      title="Excluir este destino?"
      description={deleteError || `“${toDelete?.name ?? ''}” e as saídas registradas nele serão apagados de vez. Isso não pode ser desfeito.`}
      confirmLabel="Sim, excluir"
      busyLabel="Excluindo..."
      busy={deleting}
      onConfirm={remove}
    />
    <ConfirmDialog
      open={!!outingToDelete}
      onOpenChange={(open) => { if (!open) setOutingToDelete(null); }}
      title="Excluir esta saída?"
      description="O registro desta saída será apagado de vez. O destino continua no banco."
      confirmLabel="Sim, excluir"
      busyLabel="Excluindo..."
      busy={false}
      onConfirm={removeOuting}
    />
  </div>;
}
