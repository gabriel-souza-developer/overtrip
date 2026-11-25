import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Images, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createOrganizationGalleryEntry, deleteOrganizationGalleryEntry, listOrganizationGallery, updateOrganizationGalleryEntry, type OrganizationGalleryEntry, type OrganizationGalleryEssentials } from '../api/organizationGallery';
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
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const CAN_MANAGE_GALLERY = (role: string) => role === 'OWNER' || role === 'ADMIN';

interface EntryForm { title: string; date: string; description: string; images: Array<{ src: string; alt: string; previewSrc?: string }> }
const emptyForm = (): EntryForm => ({ title: '', date: '', description: '', images: [] });
const longDatePt = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${d} de ${months[m - 1]} de ${y}`;
};

export default function OrganizationGallery() {
  useDocumentTitle('Galeria');
  const { organization, role } = useOutletContext<OrganizationOutletContext>();
  const canManage = CAN_MANAGE_GALLERY(role);
  const [entries, setEntries] = useState<OrganizationGalleryEntry[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [isFeatured, setIsFeatured] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const [editing, setEditing] = useState<OrganizationGalleryEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState<OrganizationGalleryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  const openCreate = () => { setEditing(null); setCreating(true); setForm(emptyForm()); setFormError(''); };
  const openEdit = (entry: OrganizationGalleryEntry) => {
    setCreating(false); setEditing(entry); setFormError('');
    setForm({ title: entry.title, date: entry.date.slice(0, 10), description: entry.description, images: entry.images });
  };
  const closeForm = () => { if (saving) return; setCreating(false); setEditing(null); setForm(emptyForm()); };
  const patch = (changes: Partial<EntryForm>) => setForm((prev) => ({ ...prev, ...changes }));
  const removeImage = (index: number) => setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));

  const save = async () => {
    if (saving || photoPending) return;
    if (!form.title.trim() || !form.date || !form.description.trim() || form.images.length === 0) {
      setFormError('Preencha título, data e descrição, e adicione ao menos uma foto.');
      return;
    }
    setSaving(true); setFormError('');
    try {
      const dateISO = new Date(`${form.date}T12:00:00.000Z`).toISOString();
      const data: OrganizationGalleryEssentials = {
        title: form.title.trim(), date: dateISO, dateDisplay: longDatePt(dateISO), description: form.description.trim(),
        // Nunca envia previewSrc: a rota só reconhece o caminho canônico
        // (ver organizationOwnedMedia.ts); previewSrc é só para exibição.
        images: form.images.map(({ src, alt }) => ({ src, alt })),
      };
      if (editing) await updateOrganizationGalleryEntry(organization.id, editing.id, { ...data, expectedUpdatedAt: editing.updatedAt });
      else await createOrganizationGalleryEntry(organization.id, data);
      setCreating(false); setEditing(null); setForm(emptyForm());
      await load(editing ? pagination.page : 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a memória.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteOrganizationGalleryEntry(organization.id, toDelete.id);
      setToDelete(null);
      await load(entries.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir a memória.');
    } finally {
      setDeleting(false);
    }
  };

  return <div className="space-y-6">
    <PageHeader
      title="Galeria de memórias"
      description={canManage ? 'Registre e edite as memórias desta empresa.' : 'Consulte as memórias registradas pela sua empresa.'}
      actions={canManage ? <Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate}>Nova memória</Button> : undefined}
    />
    <FilterBar searchLabel="Buscar memórias" searchPlaceholder="Buscar por título ou descrição" searchValue={search} onSearch={setSearch} hasFilters={!!search || !!isFeatured} onClear={() => { setSearch(''); setIsFeatured(''); }}>
      <select className="select w-full lg:w-48" aria-label="Filtrar por destaque" value={isFeatured} onChange={event => setIsFeatured(event.target.value)}>
        <option value="">Todos os destaques</option><option value="true">Em destaque</option><option value="false">Sem destaque</option>
      </select>
    </FilterBar>
    {error && <ErrorState message={error} onRetry={() => void load(pagination.page)} />}
    {loading ? <p role="status" className="text-sm text-surface-600">Carregando memórias...</p> : !error && entries.length === 0
      ? <EmptyState icon={<Images />} title="Nenhuma memória encontrada" text={search || isFeatured ? 'Nenhuma memória corresponde aos filtros selecionados.' : canManage ? 'Registre a primeira memória desta empresa.' : 'Esta empresa ainda não tem memórias registradas.'} action={canManage && !search && !isFeatured ? <Button variant="primary" onClick={openCreate}>Nova memória</Button> : undefined} />
      : !error && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{entries.map(entry => <article key={entry.id} className="card overflow-hidden">
        {entry.images[0] ? <img className="h-40 w-full object-cover" src={entry.images[0].previewSrc ?? entry.images[0].src} alt={entry.images[0].alt} loading="lazy" /> : <div className="flex h-40 items-center justify-center bg-surface-100 text-surface-500" aria-label="Imagem indisponível"><Images className="h-8 w-8" aria-hidden="true" /></div>}
        <div className="space-y-2 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-semibold text-surface-900 break-words">{entry.title}</h2><div className="flex items-center gap-2">{entry.isFeatured && <span className="badge-warning">Em destaque</span>}{canManage && entry.canEdit && <Button small icon={<Pencil className="w-4 h-4" aria-hidden="true" />} onClick={() => openEdit(entry)} aria-label={`Editar ${entry.title}`} />}{canManage && entry.canEdit && (
            <button type="button" className="btn-icon text-red-700 hover:bg-red-50" onClick={() => { setDeleteError(''); setToDelete(entry); }} aria-label={`Excluir ${entry.title}`}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}</div></div>
          <p className="text-xs text-surface-600">{entry.dateDisplay || formatDateBR(entry.date)}</p><p className="text-sm text-surface-600 break-words">{entry.description}</p></div>
      </article>)}</div>}
    {!loading && !error && <Pagination pagination={pagination} onChange={page => void load(page)} />}

    {canManage && (
      <Modal
        open={creating || !!editing}
        onOpenChange={(open) => { if (!open) closeForm(); }}
        title={creating ? 'Nova memória' : 'Editar memória'}
        description="Visível só para esta empresa. Nunca aparece no site enquanto a empresa não estiver habilitada na vitrine pública."
        widthClass="max-w-2xl"
        footer={<><Button onClick={closeForm} disabled={saving}>Cancelar</Button><Button variant="primary" disabled={photoPending} loading={saving} loadingText="Salvando..." onClick={() => void save()}>Salvar</Button></>}
      >
        <form id="org-gallery-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="space-y-4">
          {formError && <div className="alert-error" role="alert">{formError}</div>}
          <Field id="org-gallery-title" label="Título" required>
            <input id="org-gallery-title" className="input" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field id="org-gallery-date" label="Data" required>
            <input id="org-gallery-date" type="date" className="input" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
          </Field>
          <Field id="org-gallery-description" label="Descrição" required>
            <textarea id="org-gallery-description" className="input" rows={3} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
          </Field>
          <div className="form-group">
            <span className="label" id="org-gallery-media-label">Fotos</span>
            <p className="hint mb-2">Adicione ao menos uma foto. A primeira é a capa.</p>
            {form.images.length > 0 && <ul className="flex flex-wrap gap-2 mb-2">{form.images.map((image, index) => (
              <li key={`${image.src}-${index}`} className="relative">
                <img src={image.previewSrc ?? image.src} alt={image.alt} className="h-20 w-20 rounded-lg object-cover" />
                <button type="button" className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-surface-700 shadow" onClick={() => removeImage(index)} aria-label={`Remover foto ${index + 1}`}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </li>
            ))}</ul>}
            {form.images.length < 5 && (
              <ImageUploader idPrefix="org-gallery-photo" maxPhotos={5 - form.images.length} onPendingChange={setPhotoPending} endpoint={`/organizations/${encodeURIComponent(organization.id)}/tourism/media`} onAdd={({ src, alt, previewSrc }) => setForm((previous) => ({ ...previous, images: [...previous.images, { src, alt, previewSrc }] }))} />
            )}
            {photoPending && <p className="hint" role="status">Conclua ou descarte os envios de fotos antes de salvar.</p>}
          </div>
        </form>
      </Modal>
    )}

    <ConfirmDialog
      open={!!toDelete}
      onOpenChange={(open) => { if (!open && !deleting) { setToDelete(null); setDeleteError(''); } }}
      title="Excluir esta memória?"
      description={deleteError || `“${toDelete?.title ?? ''}” será apagada de vez. Isso não pode ser desfeito.`}
      confirmLabel="Sim, excluir"
      busyLabel="Excluindo..."
      busy={deleting}
      onConfirm={remove}
    />
  </div>;
}
