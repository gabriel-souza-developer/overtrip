import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createOrganizationVisit, deleteOrganizationVisit, listOrganizationVisits, updateOrganizationVisit, type OrganizationVisit, type OrganizationVisitEssentials } from '../api/organizationVisits';
import type { OrganizationOutletContext } from './OrganizationLayout';
import { formatDateBR } from '../lib/dateInput';
import PageHeader from '../components/PageHeader';
import FilterBar from '../components/FilterBar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Field from '../components/Field';
import ImageUploader from '../components/ImageUploader';
import ConfirmDialog from '../components/ConfirmDialog';

const CAN_MANAGE_VISITS = (role: string) => role === 'OWNER' || role === 'ADMIN';

interface VisitForm { title: string; description: string; date: string; city: string; region: string; lat: string; lng: string; images: Array<{ src: string; alt: string; previewSrc?: string }> }
const emptyForm = (): VisitForm => ({ title: '', description: '', date: '', city: '', region: '', lat: '', lng: '', images: [] });

export default function OrganizationVisits() {
  const { organization, role } = useOutletContext<OrganizationOutletContext>();
  const canManage = CAN_MANAGE_VISITS(role);
  const [visits, setVisits] = useState<OrganizationVisit[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [needsReview, setNeedsReview] = useState('');
  const [hasCoords, setHasCoords] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const [editing, setEditing] = useState<OrganizationVisit | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<VisitForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState<OrganizationVisit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  const openCreate = () => { setEditing(null); setCreating(true); setForm(emptyForm()); setFormError(''); };
  const openEdit = (visit: OrganizationVisit) => {
    setCreating(false); setEditing(visit); setFormError('');
    setForm({
      title: visit.title, description: visit.description ?? '', date: visit.date ? visit.date.slice(0, 10) : '',
      city: visit.city, region: visit.region, lat: visit.lat !== null ? String(visit.lat) : '', lng: visit.lng !== null ? String(visit.lng) : '',
      images: visit.images,
    });
  };
  const closeForm = () => { if (saving) return; setCreating(false); setEditing(null); setForm(emptyForm()); };
  const patch = (changes: Partial<VisitForm>) => setForm((prev) => ({ ...prev, ...changes }));
  const removeImage = (index: number) => setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));

  const save = async () => {
    if (!form.title.trim() || !form.city.trim() || !form.region.trim()) {
      setFormError('Preencha título, cidade e estado.');
      return;
    }
    if ((form.lat.trim() === '') !== (form.lng.trim() === '')) {
      setFormError('Informe latitude e longitude juntas, ou nenhuma das duas.');
      return;
    }
    setSaving(true); setFormError('');
    try {
      const data: OrganizationVisitEssentials = {
        title: form.title.trim(), description: form.description.trim() || null,
        date: form.date ? new Date(`${form.date}T00:00:00.000Z`).toISOString() : null,
        city: form.city.trim(), region: form.region.trim(),
        lat: form.lat.trim() ? Number(form.lat) : null, lng: form.lng.trim() ? Number(form.lng) : null,
        // Nunca envia previewSrc: a rota só reconhece o caminho canônico
        // (ver organizationOwnedMedia.ts); previewSrc é só para exibição.
        images: form.images.map(({ src, alt }) => ({ src, alt })),
      };
      if (editing) await updateOrganizationVisit(organization.id, editing.id, { ...data, expectedUpdatedAt: editing.updatedAt });
      else await createOrganizationVisit(organization.id, data);
      setCreating(false); setEditing(null); setForm(emptyForm());
      await load(editing ? pagination.page : 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar o destino.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteOrganizationVisit(organization.id, toDelete.id);
      setToDelete(null);
      await load(visits.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page);
    } catch (err) {
      // Fica no diálogo (não fecha): a mensagem do servidor explica por que
      // (memória da galeria associada) sem perder o contexto.
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir o destino.');
    } finally {
      setDeleting(false);
    }
  };

  return <div className="space-y-6">
    <PageHeader
      title="Destinos visitados"
      description={canManage ? 'Registre e edite os destinos que sua empresa já visitou.' : 'Consulte os destinos registrados pela sua empresa.'}
      actions={canManage ? <Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate}>Novo destino</Button> : undefined}
    />
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
      ? <EmptyState icon={<MapPin />} title="Nenhum destino encontrado" text={search || needsReview || hasCoords ? 'Nenhum destino corresponde aos filtros selecionados.' : canManage ? 'Registre o primeiro destino visitado por esta empresa.' : 'Esta empresa ainda não tem destinos registrados.'} action={canManage && !search && !needsReview && !hasCoords ? <Button variant="primary" onClick={openCreate}>Novo destino</Button> : undefined} />
      : !error && <div className="grid gap-3">{visits.map(visit => <article key={visit.id} className="card flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        {visit.images[0] && <img src={visit.images[0].previewSrc ?? visit.images[0].src} alt={visit.images[0].alt} className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />}
        <div className="min-w-0 flex-1 space-y-1"><h2 className="font-semibold text-surface-900 break-words">{visit.title}</h2>
          <p className="text-sm text-surface-600">{visit.city} · {visit.region}{visit.date ? ` · ${formatDateBR(visit.date)}` : ''}</p>
          {visit.description && <p className="text-sm text-surface-600 break-words">{visit.description}</p>}
          <p className="text-xs text-surface-600">{visit.lat !== null && visit.lng !== null ? 'Coordenadas cadastradas' : 'Sem coordenadas'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={visit.needsReview ? 'badge-warning' : 'badge-success'}>{visit.needsReview ? 'Precisa de revisão' : 'Revisado'}</span>
          {canManage && visit.canEdit && <Button small icon={<Pencil className="w-4 h-4" aria-hidden="true" />} onClick={() => openEdit(visit)} aria-label={`Editar ${visit.title}`}><span className="hidden sm:inline">Editar</span></Button>}
          {canManage && visit.canEdit && (
            <button type="button" className="btn-icon text-red-700 hover:bg-red-50" onClick={() => { setDeleteError(''); setToDelete(visit); }} aria-label={`Excluir ${visit.title}`}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </article>)}</div>}
    {!loading && !error && <Pagination pagination={pagination} onChange={page => void load(page)} />}

    {canManage && (
      <Modal
        open={creating || !!editing}
        onOpenChange={(open) => { if (!open) closeForm(); }}
        title={creating ? 'Novo destino' : 'Editar destino'}
        description="Visível só para esta empresa. Nunca aparece no site enquanto a empresa não estiver habilitada na vitrine pública."
        widthClass="max-w-2xl"
        footer={<><Button onClick={closeForm} disabled={saving}>Cancelar</Button><Button variant="primary" loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar</Button></>}
      >
        <form id="org-visit-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="space-y-4">
          {formError && <div className="alert-error" role="alert">{formError}</div>}
          <Field id="org-visit-title" label="Título" required>
            <input id="org-visit-title" className="input" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="org-visit-city" label="Cidade" required>
              <input id="org-visit-city" className="input" value={form.city} onChange={(e) => patch({ city: e.target.value })} />
            </Field>
            <Field id="org-visit-region" label="Estado" required>
              <input id="org-visit-region" className="input" value={form.region} onChange={(e) => patch({ region: e.target.value })} />
            </Field>
          </div>
          <Field id="org-visit-date" label="Data da visita (opcional)">
            <input id="org-visit-date" type="date" className="input" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="org-visit-lat" label="Latitude (opcional)" hint="Informe junto com a longitude, ou deixe as duas em branco.">
              <input id="org-visit-lat" type="text" inputMode="decimal" className="input" value={form.lat} onChange={(e) => patch({ lat: e.target.value })} placeholder="-7.1195" />
            </Field>
            <Field id="org-visit-lng" label="Longitude (opcional)">
              <input id="org-visit-lng" type="text" inputMode="decimal" className="input" value={form.lng} onChange={(e) => patch({ lng: e.target.value })} placeholder="-34.8450" />
            </Field>
          </div>
          <Field id="org-visit-description" label="Descrição (opcional)">
            <textarea id="org-visit-description" className="input" rows={3} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
          </Field>
          <div className="form-group">
            <span className="label">Fotos (opcional)</span>
            {form.images.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{form.images.map((image, index) => (
              <li key={`${image.src}-${index}`} className="relative">
                <img src={image.previewSrc ?? image.src} alt={image.alt} className="h-20 w-20 rounded-lg object-cover" />
                <button type="button" className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-surface-700 shadow" onClick={() => removeImage(index)} aria-label={`Remover foto ${index + 1}`}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </li>
            ))}</ul>}
            {form.images.length < 5 && (
              <div className="mt-2">
                <ImageUploader idPrefix="org-visit-photo" endpoint={`/organizations/${encodeURIComponent(organization.id)}/tourism/media`} onAdd={(item) => patch({ images: [...form.images, item] })} />
              </div>
            )}
          </div>
        </form>
      </Modal>
    )}

    <ConfirmDialog
      open={!!toDelete}
      onOpenChange={(open) => { if (!open && !deleting) { setToDelete(null); setDeleteError(''); } }}
      title="Excluir este destino?"
      description={deleteError || `“${toDelete?.title ?? ''}” será apagado de vez. Isso não pode ser desfeito.`}
      confirmLabel="Sim, excluir"
      busyLabel="Excluindo..."
      busy={deleting}
      onConfirm={remove}
    />
  </div>;
}
