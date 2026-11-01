import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, Link2Off, MapPin, Pencil, Trash2 } from 'lucide-react';
import { visitApi, tripApi, Visit, Trip, Pagination as PaginationInfo } from '../api';
import { formatDateBR, localInputToIso } from '../lib/dateInput';
import { visitToEditForm, reviewAfterSave, VisitEditForm } from '../lib/visitForm';
import { tripStatusLabel, countFilled } from '../lib/panelHelpers';
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

type TripOption = Pick<Trip, 'id' | 'title' | 'status'>;

const formatDate = formatDateBR;

export default function Visits() {
  const list = useListParams();
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Visit | null>(null);
  const [editForm, setEditForm] = useState<VisitEditForm | null>(null);
  const [associating, setAssociating] = useState<Visit | null>(null);
  const [associateTripId, setAssociateTripId] = useState('');
  const [toDelete, setToDelete] = useState<Visit | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

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

  // Todas as viagens (não só as que já têm visita), para poder associar qualquer uma.
  useEffect(() => {
    tripApi.list({ limit: 100 }).then((d) => setTrips(d.data)).catch(() => { /* a lista de viagens é um apoio */ });
  }, []);

  const openEdit = (visit: Visit) => {
    setEditing(visit);
    setEditForm(visitToEditForm(visit));
    setFormError('');
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
    setEditForm(null);
  };

  const patch = (changes: Partial<VisitEditForm>) => setEditForm((prev) => (prev ? { ...prev, ...changes } : prev));

  const saveEdit = async (markReviewed: boolean) => {
    if (!editing || !editForm) return;
    if (!editForm.title.trim() || !editForm.region.trim() || !editForm.city.trim()) {
      setFormError('Preencha o nome, o estado e a cidade.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await visitApi.update(editing.id, {
        title: editForm.title,
        description: editForm.description.trim() ? editForm.description : null,
        city: editForm.city,
        region: editForm.region,
        lat: editForm.lat,
        lng: editForm.lng,
        notes: editForm.notes.trim() ? editForm.notes : null,
        needsReview: reviewAfterSave(editing.needsReview, markReviewed),
        date: localInputToIso(editForm.date, editing.date),
        // A API só aceita um código de viagem ou nada; texto vazio vira "nada".
        tripId: editForm.tripId || null,
      });
      toast.success('Destino salvo.');
      setEditing(null);
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

  const openAssociate = (visit: Visit) => {
    setAssociating(visit);
    setAssociateTripId(visit.tripId || '');
  };

  const saveAssociation = async () => {
    if (!associating) return;
    setSaving(true);
    try {
      await visitApi.associate(associating.id, associateTripId || null);
      toast.success(associateTripId ? 'Destino ligado à viagem.' : 'Destino desligado da viagem.');
      setAssociating(null);
      await loadVisits();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível ligar o destino à viagem.');
    } finally {
      setSaving(false);
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
      <PageHeader title="Destinos visitados" description="Lugares visitados. Confira os dados e ligue cada destino à viagem certa." />

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
                  <th scope="col" className="hidden lg:table-cell">Viagem</th>
                  <th scope="col"><span className="visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.id}>
                    <td className="max-w-[16rem]">
                      <button type="button" className="font-medium text-surface-900 hover:text-primary-700 hover:underline text-left" onClick={() => openEdit(visit)}>{visit.title}</button>
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
                    <td className="hidden lg:table-cell text-surface-700">
                      {visit.trip ? <>{visit.trip.title} <span className="text-surface-600">({tripStatusLabel(visit.trip.status)})</span></> : <span className="text-surface-600">Sem viagem</span>}
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
                            { key: 'link', label: visit.tripId ? 'Trocar a viagem' : 'Ligar a uma viagem', icon: visit.tripId ? <Link2Off className="w-4 h-4" aria-hidden="true" /> : <Link2 className="w-4 h-4" aria-hidden="true" />, onSelect: () => openAssociate(visit) },
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
        open={!!editing}
        onOpenChange={(open) => { if (!open) closeEdit(); }}
        title="Editar destino"
        description="O básico fica aqui; o resto está nas seções abaixo."
        widthClass="max-w-2xl"
        footer={
          <>
            <Button onClick={closeEdit} disabled={saving}>Cancelar</Button>
            <Button variant={editing?.needsReview ? 'secondary' : 'primary'} loading={saving} loadingText="Salvando..." onClick={() => saveEdit(false)}>Salvar</Button>
            {editing?.needsReview ? (
              <Button variant="primary" loading={saving} loadingText="Salvando..." onClick={() => saveEdit(true)}>Salvar e marcar como revisado</Button>
            ) : null}
          </>
        }
      >
        {editForm && (
          <form id="visit-form" onSubmit={(e) => { e.preventDefault(); saveEdit(!!editing?.needsReview); }} noValidate className="space-y-4">
            {formError && <div className="alert-error" role="alert">{formError}</div>}
            <Field id="edit-title" label="Nome do destino" required>
              <input id="edit-title" className="input" value={editForm.title} onChange={(e) => patch({ title: e.target.value })} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="edit-region" label="Estado" required>
                <UfSelect
                  id="edit-region"
                  name="region"
                  value={editForm.region}
                  onChange={(val, previousIsKnownUf) => setEditForm((prev) => prev && ({ ...prev, region: val, city: nextCityOnRegionChange(prev.city, prev.region, val, previousIsKnownUf) }))}
                />
              </Field>
              <Field id="edit-city" label="Cidade" required>
                <CityAutocomplete id="edit-city" name="city" value={editForm.city} uf={editForm.region} onChange={(val) => patch({ city: val })} />
              </Field>
              <Field id="edit-date" label="Data">
                <input id="edit-date" type="datetime-local" className="input" value={editForm.date} onChange={(e) => patch({ date: e.target.value })} />
              </Field>
              <Field id="edit-tripId" label="Viagem">
                <select id="edit-tripId" className="select" value={editForm.tripId} onChange={(e) => patch({ tripId: e.target.value })}>
                  <option value="">Sem viagem</option>
                  {trips.map((t) => <option key={t.id} value={t.id}>{t.title} ({tripStatusLabel(t.status)})</option>)}
                  {editForm.tripId && !trips.some((t) => t.id === editForm.tripId) && editing?.trip && (
                    <option value={editForm.tripId}>{editing.trip.title} ({tripStatusLabel(editing.trip.status)})</option>
                  )}
                </select>
              </Field>
            </div>
            <FormSection title="Posição no mapa" summary="Latitude e longitude" filled={countFilled([editForm.lat, editForm.lng])}>
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

      <Modal
        open={!!associating}
        onOpenChange={(open) => { if (!open && !saving) setAssociating(null); }}
        title="Ligar a uma viagem"
        description={associating ? `Destino: ${associating.title}` : undefined}
        footer={
          <>
            <Button onClick={() => setAssociating(null)} disabled={saving}>Cancelar</Button>
            <Button variant="primary" loading={saving} loadingText="Salvando..." onClick={saveAssociation}>Salvar</Button>
          </>
        }
      >
        <Field id="associate-trip" label="Viagem" hint="Escolha “Sem viagem” para desfazer a ligação.">
          <select id="associate-trip" className="select" value={associateTripId} onChange={(e) => setAssociateTripId(e.target.value)}>
            <option value="">Sem viagem</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.title} ({tripStatusLabel(t.status)})</option>)}
          </select>
        </Field>
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
