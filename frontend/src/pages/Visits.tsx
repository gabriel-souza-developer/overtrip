import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { visitApi, Visit, Pagination as PaginationInfo } from '../api';
import { formatDateBR, localInputToIso } from '../lib/dateInput';
import { visitToEditForm, reviewAfterSave, VisitEditForm } from '../lib/visitForm';
import { locationMapUrl, LocationResult, parseLocationResults } from '../lib/locationSearch';
import { countFilled } from '../lib/panelHelpers';
import { useToast } from '../hooks/useToast';
import { useListParams } from '../hooks/useListParams';
import { CityAutocomplete, UfSelect } from '../components/LocationFields';
import { nextCityOnRegionChange } from '../lib/locationCombobox';
import PageHeader from '../components/PageHeader';
import FilterBar from '../components/FilterBar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import RowMenu from '../components/RowMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Field from '../components/Field';
import FormSection from '../components/FormSection';

const formatDate = formatDateBR;

export default function Visits() {
  const list = useListParams();
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Visit | null>(null);
  const [creating, setCreating] = useState(false);
  const [editForm, setEditForm] = useState<VisitEditForm | null>(null);
  const [toDelete, setToDelete] = useState<Visit | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [locationError, setLocationError] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [searchingLocation, setSearchingLocation] = useState(false);
  const locationRequest = useRef<AbortController | null>(null);

  useEffect(() => () => locationRequest.current?.abort(), []);

  const { page } = list;
  const needsReview = list.get('needsReview');
  const hasCoords = list.get('hasCoords');
  const city = list.get('city');
  const region = list.get('region');
  const tripId = list.get('tripId');
  const search = list.get('search');

  const loadVisits = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await visitApi.list({
        page, limit: 20,
        ...(needsReview ? { needsReview: needsReview === 'true' } : {}),
        ...(hasCoords ? { hasCoords: hasCoords === 'true' } : {}),
        ...(tripId ? { tripId } : {}),
        ...(city ? { city } : {}),
        ...(region ? { region } : {}),
        ...(search ? { search } : {}),
      });
      setVisits(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os destinos visitados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisits();
  }, [page, needsReview, hasCoords, tripId, city, region, search]);

  const openEdit = (visit: Visit) => {
    locationRequest.current?.abort();
    setLocationQuery([visit.title, visit.city, visit.region, 'Brasil'].filter(Boolean).join(', '));
    setLocationResults([]);
    setLocationError('');
    setLocationNotice('');
    setSearchingLocation(false);
    setCreating(false);
    setEditing(visit);
    setEditForm(visitToEditForm(visit));
    setFormError('');
  };

  const openCreate = () => {
    locationRequest.current?.abort();
    setEditing(null);
    setCreating(true);
    setEditForm({ title: '', description: '', date: '', city: '', region: '', lat: null, lng: null, notes: '', tripId: '' });
    setLocationQuery('');
    setLocationResults([]);
    setLocationError('');
    setLocationNotice('');
    setSearchingLocation(false);
    setFormError('');
  };

  const closeEdit = () => {
    if (saving) return;
    locationRequest.current?.abort();
    setEditing(null);
    setCreating(false);
    setEditForm(null);
  };

  const patch = (changes: Partial<VisitEditForm>) => setEditForm((prev) => (prev ? { ...prev, ...changes } : prev));

  const searchLocation = async () => {
    const query = locationQuery.trim();
    if (query.length < 3) { setLocationError('Digite pelo menos três caracteres.'); return; }
    locationRequest.current?.abort();
    const controller = new AbortController();
    locationRequest.current = controller;
    setSearchingLocation(true);
    setLocationError('');
    setLocationResults([]);
    try {
      const url = new URL('https://photon.komoot.io/api/');
      url.search = new URLSearchParams({ q: query, limit: '5' }).toString();
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error('Serviço de pesquisa indisponível. Tente novamente.');
      const results = parseLocationResults(await response.json());
      if (controller.signal.aborted) return;
      setLocationResults(results);
      if (!results.length) setLocationError('Nenhum local encontrado. Experimente outro nome ou inclua a cidade.');
    } catch (err) {
      if (!controller.signal.aborted) setLocationError('Não foi possível pesquisar agora. Tente novamente ou informe as coordenadas manualmente.');
    } finally {
      if (!controller.signal.aborted) setSearchingLocation(false);
    }
  };

  const saveEdit = async (markReviewed: boolean) => {
    if ((!editing && !creating) || !editForm) return;
    if (!editForm.title.trim() || !editForm.region.trim() || !editForm.city.trim()) {
      setFormError('Preencha o nome. Se necessário, confira cidade e estado em Informações adicionais.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const data = {
        title: editForm.title,
        description: editForm.description.trim() ? editForm.description : null,
        city: editForm.city,
        region: editForm.region,
        lat: editForm.lat,
        lng: editForm.lng,
        notes: editForm.notes.trim() ? editForm.notes : null,
        needsReview: reviewAfterSave(editing?.needsReview ?? true, markReviewed),
        date: localInputToIso(editForm.date, editing?.date),
      };
      if (editing) await visitApi.update(editing.id, data);
      else await visitApi.create(data);
      toast.success('Destino salvo.');
      setEditing(null);
      setCreating(false);
      setEditForm(null);
      await loadVisits();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar o destino.');
    } finally {
      setSaving(false);
    }
  };

  const markReviewed = async (visit: Visit) => {
    setBusyId(visit.id);
    try {
      await visitApi.update(visit.id, { needsReview: false });
      toast.success(`“${visit.title}” marcado como revisado.`);
      await loadVisits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível marcar como revisado.');
    } finally {
      setBusyId(null);
    }
  };

  const sendBackToReview = async (visit: Visit) => {
    setBusyId(visit.id);
    try {
      await visitApi.update(visit.id, { needsReview: true });
      toast.success(`“${visit.title}” voltou para revisão.`);
      await loadVisits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível voltar o destino para revisão.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await visitApi.delete(toDelete.id);
      toast.success('Destino excluído.');
      setToDelete(null);
      if (visits.length === 1 && page > 1) list.setPage(page - 1);
      else await loadVisits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir o destino.');
    } finally {
      setBusyId(null);
    }
  };

  const hasFilters = !!(search || needsReview || hasCoords || city || region || tripId);

  return (
    <div className="space-y-6">
      <PageHeader title="Destinos visitados" description="Registre e revise os lugares que a OVERTRIP já visitou." actions={<Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate}>Adicionar destino</Button>} />

      <FilterBar
        searchLabel="Buscar destinos"
        searchPlaceholder="Buscar por nome, cidade ou origem"
        searchValue={search}
        onSearch={(value) => list.setFilter('search', value)}
        onClear={list.clear}
        hasFilters={hasFilters}
      >
        <select className="select w-full lg:w-52" value={needsReview} onChange={(e) => list.setFilter('needsReview', e.target.value)} aria-label="Filtrar por revisão">
          <option value="">Todos os destinos</option>
          <option value="true">Só os que faltam revisar</option>
          <option value="false">Só os já revisados</option>
        </select>
        <select className="select w-full lg:w-52" value={hasCoords} onChange={(e) => list.setFilter('hasCoords', e.target.value)} aria-label="Filtrar por posição no mapa">
          <option value="">Com ou sem mapa</option>
          <option value="true">Só os que têm local no mapa</option>
          <option value="false">Só os sem local no mapa</option>
        </select>
      </FilterBar>

      {error ? <ErrorState message={error} onRetry={loadVisits} /> : null}

      <div className="card" aria-busy={loading}>
        {loading && visits.length === 0 ? (
          <div className="p-4 space-y-3" aria-label="Carregando destinos">
            {[1, 2, 3, 4].map((i) => <div key={i} className="loading-skeleton h-12 w-full" />)}
          </div>
        ) : visits.length === 0 && !error ? (
          <EmptyState
            icon={<MapPin className="w-6 h-6" />}
            title={hasFilters ? 'Nenhum destino encontrado' : 'Ainda não há destinos visitados'}
            text={hasFilters ? 'Tente outra busca ou limpe os filtros.' : 'Os destinos aparecem aqui quando forem importados ou cadastrados.'}
            action={hasFilters ? <Button onClick={list.clear}>Limpar filtros</Button> : undefined}
          />
        ) : (
          <div className={`table-container ${loading ? 'opacity-60' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Destino</th>
                  <th scope="col" className="hidden md:table-cell">Data</th>
                  <th scope="col" className="hidden xl:table-cell">Mapa</th>
                  <th scope="col">Revisão</th>
                  <th scope="col"><span className="visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.id}>
                    <td className="max-w-[16rem]">
                      <button type="button" className="font-medium text-surface-900 hover:text-primary-500 hover:underline text-left" onClick={() => openEdit(visit)}>{visit.title}</button>
                      <p className="text-xs text-surface-600 mt-0.5">{visit.city}/{visit.region}<span className="md:hidden"> · {formatDate(visit.date)}</span></p>
                    </td>
                    <td className="hidden md:table-cell text-surface-700 whitespace-nowrap">{formatDate(visit.date)}</td>
                    <td className="hidden xl:table-cell">
                      {visit.lat !== null && visit.lng !== null
                        ? <span className="badge badge-success gap-1"><MapPin className="w-3 h-3" aria-hidden="true" />No mapa</span>
                        : <span className="badge badge-neutral">Sem mapa</span>}
                    </td>
                    <td>
                      {visit.needsReview
                        ? <span className="badge badge-warning gap-1"><AlertTriangle className="w-3 h-3" aria-hidden="true" />Revisar</span>
                        : <span className="badge badge-success gap-1"><CheckCircle2 className="w-3 h-3" aria-hidden="true" />Revisado</span>}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {visit.needsReview ? (
                          <Button small variant="secondary" loading={busyId === visit.id} loadingText="Salvando..." onClick={() => markReviewed(visit)} aria-label={`Marcar como revisado: ${visit.title}`}>
                            <span className="hidden sm:inline">Marcar revisado</span><span className="sm:hidden">OK</span>
                          </Button>
                        ) : null}
                        <RowMenu
                          label={`Mais opções de ${visit.title}`}
                          items={[
                            { key: 'edit', label: 'Editar', icon: <Pencil className="w-4 h-4" aria-hidden="true" />, onSelect: () => openEdit(visit) },
                            ...(visit.needsReview ? [] : [{ key: 'unreview', label: 'Voltar para revisão', icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />, onSelect: () => sendBackToReview(visit) }]),
                            { key: 'delete', label: 'Excluir', danger: true, icon: <Trash2 className="w-4 h-4" aria-hidden="true" />, onSelect: () => setToDelete(visit) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={pagination} onChange={list.setPage} />
      </div>

      <Modal
        open={!!editing || creating}
        onOpenChange={(open) => { if (!open) closeEdit(); }}
        title={creating ? 'Adicionar destino' : 'Editar destino'}
        description="Confira o nome e a localização do lugar visitado."
        widthClass="max-w-2xl"
        footer={
          <>
            <Button onClick={closeEdit} disabled={saving}>Cancelar</Button>
            <Button variant={creating || editing?.needsReview ? 'secondary' : 'primary'} loading={saving} loadingText="Salvando..." onClick={() => saveEdit(false)}>Salvar</Button>
            {creating || editing?.needsReview ? (
              <Button variant="primary" loading={saving} loadingText="Salvando..." onClick={() => saveEdit(true)}>Salvar e marcar como revisado</Button>
            ) : null}
          </>
        }
      >
        {editForm && (
          <form id="visit-form" onSubmit={(e) => { e.preventDefault(); saveEdit(false); }} noValidate className="space-y-4">
            {formError && <div className="alert-error" role="alert">{formError}</div>}
            {creating && <p className="hint">Para aparecer no mapa do site, confirme a localização e marque o destino como revisado ao salvar.</p>}
            <Field id="edit-title" label="Nome do destino" required>
              <input id="edit-title" className="input" value={editForm.title} onChange={(e) => patch({ title: e.target.value })} />
            </Field>
            <FormSection title="Localização no mapa" summary="Pesquise e confirme o lugar" defaultOpen>
              <Field id="location-search" label="Pesquisar localização" hint="Confira o resultado no mapa antes de usar as coordenadas.">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input id="location-search" className="input" value={locationQuery} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!searchingLocation) void searchLocation(); } }} onChange={(e) => { locationRequest.current?.abort(); setSearchingLocation(false); setLocationQuery(e.target.value); setLocationResults([]); setLocationError(''); }} />
                  <Button loading={searchingLocation} loadingText="Pesquisando..." onClick={searchLocation}>Pesquisar</Button>
                </div>
              </Field>
              {locationError && <p className="text-sm text-red-700" role="alert">{locationError}</p>}
              {locationResults.length > 0 && <ul className="space-y-3" aria-label="Resultados da pesquisa">
                {locationResults.map((result, index) => <li key={`${result.lat}-${result.lng}-${index}`} className="rounded border border-surface-200 p-3 text-sm space-y-2">
                  <p>{result.label}</p>
                  <p className="text-surface-600">{result.lat}, {result.lng}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <a className="text-primary-500 underline" href={locationMapUrl(result.lat, result.lng)} target="_blank" rel="noopener noreferrer">Abrir no mapa</a>
                    <Button small onClick={() => { patch({ lat: result.lat, lng: result.lng, ...(result.city && result.region ? { city: result.city, region: result.region } : {}) }); setLocationNotice(result.city && result.region ? `Cidade e estado preenchidos: ${result.city}/${result.region}.` : 'A pesquisa não identificou cidade e estado com segurança. Confira os dados em Informações adicionais.'); setLocationResults([]); }}>Usar esta localização</Button>
                  </div>
                </li>)}
              </ul>}
              {locationNotice && <p className="text-sm text-surface-700" role="status">{locationNotice}</p>}
              {editForm.lat !== null && editForm.lng !== null && <a className="text-primary-500 underline text-sm" href={locationMapUrl(editForm.lat, editForm.lng)} target="_blank" rel="noopener noreferrer">Ver localização atual no mapa</a>}
              <p className="text-xs text-surface-600">Busca por Photon; dados © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">colaboradores do OpenStreetMap</a>.</p>
            </FormSection>
            <FormSection title="Informações adicionais" summary="Data, cidade, estado e coordenadas manuais">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="edit-region" label="Estado" required>
                  <UfSelect id="edit-region" name="region" value={editForm.region} onChange={(val, previousIsKnownUf) => setEditForm((prev) => prev && ({ ...prev, region: val, city: nextCityOnRegionChange(prev.city, prev.region, val, previousIsKnownUf) }))} />
                </Field>
                <Field id="edit-city" label="Cidade" required>
                  <CityAutocomplete id="edit-city" name="city" value={editForm.city} uf={editForm.region} onChange={(val) => patch({ city: val })} />
                </Field>
                <Field id="edit-date" label="Data da visita">
                  <input id="edit-date" type="datetime-local" className="input" value={editForm.date} onChange={(e) => patch({ date: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="edit-lat" label="Latitude">
                  <input id="edit-lat" type="number" inputMode="decimal" step="any" min="-90" max="90" className="input" value={editForm.lat ?? ''} onChange={(e) => patch({ lat: e.target.value ? parseFloat(e.target.value) : null })} />
                  <p className="hint">Copie do Google Maps. Ex.: -7.115</p>
                </Field>
                <Field id="edit-lng" label="Longitude">
                  <input id="edit-lng" type="number" inputMode="decimal" step="any" min="-180" max="180" className="input" value={editForm.lng ?? ''} onChange={(e) => patch({ lng: e.target.value ? parseFloat(e.target.value) : null })} />
                  <p className="hint">Copie do Google Maps. Ex.: -36.830</p>
                </Field>
              </div>
            </FormSection>
            <FormSection title="Anotações" summary="Descrição e notas internas" filled={countFilled([editForm.description, editForm.notes])}>
              <Field id="edit-description" label="Descrição">
                <textarea id="edit-description" className="input" value={editForm.description} onChange={(e) => patch({ description: e.target.value })} rows={3} />
              </Field>
              <Field id="edit-notes" label="Anotações internas" hint="Só a equipe vê.">
                <textarea id="edit-notes" className="input" value={editForm.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2} />
              </Field>
            </FormSection>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        title="Excluir este destino?"
        description={`“${toDelete?.title ?? ''}” será apagado de vez. Isso não pode ser desfeito.`}
        confirmLabel="Sim, excluir"
        busyLabel="Excluindo..."
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={remove}
      />
    </div>
  );
}
