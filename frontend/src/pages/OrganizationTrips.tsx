import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pencil, Plane, Plus } from 'lucide-react';
import { organizationApi, type OrgTrip, type OrgTripEssentials } from '../api/organizations';
import { tripStatusLabel } from '../lib/panelHelpers';
import { toLocalDateTime, fromLocalDateTime } from '../lib/organizationDateTime';
import type { OrganizationOutletContext } from './OrganizationLayout';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Field from '../components/Field';

const CAN_MANAGE_TRIPS = (role: string) => role === 'OWNER' || role === 'ADMIN';

interface TripForm { title: string; category: string; description: string; city: string; region: string; startDateISO: string; endDateISO: string }
const emptyForm: TripForm = { title: '', category: '', description: '', city: '', region: '', startDateISO: '', endDateISO: '' };

export default function OrganizationTrips() {
  const { organization, role } = useOutletContext<OrganizationOutletContext>();
  const canManage = CAN_MANAGE_TRIPS(role);
  const [trips, setTrips] = useState<OrgTrip[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<OrgTrip | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TripForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const data = await organizationApi.trips(organization.id, { page, limit: 20 });
      setTrips(data.data); setPagination(data.pagination);
    } catch (err) {
      setTrips([]);
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as viagens.');
    } finally { setLoading(false); }
  }, [organization.id]);
  useEffect(() => { void load(1); }, [load]);

  const openCreate = () => { setEditing(null); setCreating(true); setForm(emptyForm); setFormError(''); };
  const openEdit = (trip: OrgTrip) => {
    setCreating(false); setEditing(trip); setFormError('');
    setForm({
      title: trip.title, category: trip.category, description: trip.description, city: trip.city, region: trip.region,
      startDateISO: toLocalDateTime(trip.startDateISO), endDateISO: toLocalDateTime(trip.endDateISO),
    });
  };
  const closeForm = () => { if (saving) return; setCreating(false); setEditing(null); setForm(emptyForm); };
  const patch = (changes: Partial<TripForm>) => setForm((prev) => ({ ...prev, ...changes }));

  const save = async () => {
    if (!form.title.trim() || !form.category.trim() || !form.city.trim() || !form.region.trim() || !form.description.trim() || !form.startDateISO) {
      setFormError('Preencha título, categoria, cidade, estado, descrição e data de saída.');
      return;
    }
    setSaving(true); setFormError('');
    try {
      const startDateISO = fromLocalDateTime(form.startDateISO, editing?.startDateISO);
      const endDateISO = form.endDateISO ? fromLocalDateTime(form.endDateISO, editing?.endDateISO) : null;
      if (!startDateISO || (form.endDateISO && !endDateISO)) { setFormError('Informe datas válidas.'); return; }
      const data: OrgTripEssentials = {
        title: form.title.trim(), category: form.category.trim(), description: form.description.trim(),
        city: form.city.trim(), region: form.region.trim(), startDateISO, endDateISO,
      };
      if (editing) {
        const changes: Partial<OrgTripEssentials> = {};
        if (data.title !== editing.title) changes.title = data.title;
        if (data.category !== editing.category) changes.category = data.category;
        if (data.description !== editing.description) changes.description = data.description;
        if (data.city !== editing.city) changes.city = data.city;
        if (data.region !== editing.region) changes.region = data.region;
        if (startDateISO !== editing.startDateISO) changes.startDateISO = startDateISO;
        if (endDateISO !== editing.endDateISO) changes.endDateISO = endDateISO;
        if (Object.keys(changes).length) await organizationApi.updateTrip(organization.id, editing.id, { ...changes, expectedUpdatedAt: editing.updatedAt });
      } else await organizationApi.createTrip(organization.id, data);
      setCreating(false); setEditing(null); setForm(emptyForm);
      await load(editing ? pagination.page : 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a viagem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Viagens"
        description={canManage ? 'Crie e edite rascunhos de viagens desta empresa.' : 'Consulta somente leitura das viagens desta empresa.'}
        actions={canManage ? <Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate}>Nova viagem</Button> : undefined}
      />
      {error && <ErrorState message={error} onRetry={() => void load(pagination.page)} />}
      {error ? null : loading ? (
        <p role="status" className="text-sm text-surface-600">Carregando viagens...</p>
      ) : !error && trips.length === 0 ? (
        <EmptyState
          icon={<Plane />}
          title="Nenhuma viagem cadastrada"
          text={canManage ? 'Crie a primeira viagem desta empresa.' : 'Esta empresa ainda não tem viagens registradas.'}
          action={canManage ? <Button variant="primary" onClick={openCreate}>Nova viagem</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {trips.map((trip) => (
            <article key={trip.id} className="card p-4 sm:p-5 flex flex-wrap gap-3 items-start justify-between">
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold text-surface-900 break-words">{trip.title}</h2>
                <p className="text-sm text-surface-600">{trip.category} · {trip.city} - {trip.region}</p>
                <p className="text-sm text-surface-600">Saída: {new Date(trip.startDateISO).toLocaleDateString('pt-BR')}{trip.endDateISO ? ` · Retorno: ${new Date(trip.endDateISO).toLocaleDateString('pt-BR')}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge-neutral">{tripStatusLabel(trip.status)}</span>
                {canManage && trip.status === 'DRAFT' && (
                  <Button small icon={<Pencil className="w-4 h-4" aria-hidden="true" />} onClick={() => openEdit(trip)} aria-label={`Editar ${trip.title}`}>
                    <span className="hidden sm:inline">Editar</span>
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && <Pagination pagination={pagination} onChange={(page) => void load(page)} />}

      {canManage && (
        <Modal
          open={creating || !!editing}
          onOpenChange={(open) => { if (!open) closeForm(); }}
          title={creating ? 'Nova viagem' : 'Editar viagem'}
          description="Rascunho visível só para esta empresa. Nunca é publicado automaticamente."
          widthClass="max-w-2xl"
          footer={
            <>
              <Button onClick={closeForm} disabled={saving}>Cancelar</Button>
              <Button variant="primary" loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar</Button>
            </>
          }
        >
          <form id="org-trip-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="space-y-4">
            {formError && <div className="alert-error" role="alert">{formError}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="org-trip-title" label="Título" required>
                <input id="org-trip-title" className="input" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
              </Field>
              <Field id="org-trip-category" label="Categoria" required>
                <input id="org-trip-category" className="input" value={form.category} onChange={(e) => patch({ category: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="org-trip-city" label="Cidade" required>
                <input id="org-trip-city" className="input" value={form.city} onChange={(e) => patch({ city: e.target.value })} />
              </Field>
              <Field id="org-trip-region" label="Estado" required>
                <input id="org-trip-region" className="input" value={form.region} onChange={(e) => patch({ region: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="org-trip-start" label="Data de saída" required>
                <input id="org-trip-start" type="datetime-local" className="input" value={form.startDateISO} onChange={(e) => patch({ startDateISO: e.target.value })} />
              </Field>
              <Field id="org-trip-end" label="Data de retorno">
                <input id="org-trip-end" type="datetime-local" className="input" value={form.endDateISO} onChange={(e) => patch({ endDateISO: e.target.value })} />
              </Field>
            </div>
            <Field id="org-trip-description" label="Descrição" required>
              <textarea id="org-trip-description" className="input" rows={4} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
