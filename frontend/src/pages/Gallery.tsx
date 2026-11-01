import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Images, ListOrdered, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { galleryApi, tripApi, visitApi, GalleryEntry, Trip, Visit, Pagination as PaginationInfo } from '../api';
import { useToast } from '../hooks/useToast';
import { useListParams } from '../hooks/useListParams';
import { resolveAssetSrc } from '../lib/assetUrl';
import { isValidImageSrc, IMAGE_SRC_MESSAGE } from '../lib/imageSrc';
import { formatDateBR, isoToLocalInput, localInputToIso } from '../lib/dateInput';
import { fillMissingAlt } from '../lib/formHelpers';
import { countFilled, formatDateDisplay, moveItem, reorderPositions } from '../lib/panelHelpers';
import PageHeader from '../components/PageHeader';
import FilterBar from '../components/FilterBar';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Field from '../components/Field';
import FormSection from '../components/FormSection';
import ImageThumb from '../components/ImageThumb';

interface EntryForm {
  title: string;
  date: string;
  dateDisplay: string;
  description: string;
  images: Array<{ src: string; alt: string }>;
  tripId: string;
  visitId: string;
  isFeatured: boolean;
  orderIndex: number;
}

const blankForm = (position: number): EntryForm => ({
  title: '',
  date: isoToLocalInput(new Date().toISOString()),
  dateDisplay: '',
  description: '',
  images: [{ src: '', alt: '' }],
  tripId: '',
  visitId: '',
  isFeatured: false,
  orderIndex: position,
});

export default function Gallery() {
  const list = useListParams();
  const { toast } = useToast();
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<GalleryEntry | null>(null);
  const [form, setForm] = useState<EntryForm>(blankForm(0));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [toDelete, setToDelete] = useState<GalleryEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { page } = list;
  const isFeatured = list.get('isFeatured');
  const tripId = list.get('tripId');
  const visitId = list.get('visitId');
  const search = list.get('search');

  const loadGallery = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await galleryApi.list({
        page, limit: 20,
        ...(isFeatured ? { isFeatured: isFeatured === 'true' } : {}),
        ...(tripId ? { tripId } : {}),
        ...(visitId ? { visitId } : {}),
        ...(search ? { search } : {}),
      });
      setEntries(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a galeria.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setReordering(false);
    loadGallery();
  }, [page, isFeatured, tripId, visitId, search]);

  // Viagens e visitas para o campo "Ligada a" do formulário (antes ficava vazio).
  useEffect(() => {
    tripApi.list({ limit: 100 }).then((d) => setTrips(d.data)).catch(() => { /* apoio */ });
    visitApi.list({ limit: 100 }).then((d) => setVisits(d.data)).catch(() => { /* apoio */ });
  }, []);

  const openCreate = () => {
    setEditingEntry(null);
    setForm(blankForm(pagination.total));
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (entry: GalleryEntry) => {
    setEditingEntry(entry);
    setForm({
      title: entry.title,
      date: isoToLocalInput(entry.date),
      dateDisplay: entry.dateDisplay,
      description: entry.description,
      images: entry.images.length > 0 ? entry.images : [{ src: '', alt: '' }],
      tripId: entry.tripId || '',
      visitId: entry.visitId || '',
      isFeatured: entry.isFeatured,
      orderIndex: entry.orderIndex,
    });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
  };

  const patch = (changes: Partial<EntryForm>) => setForm((prev) => ({ ...prev, ...changes }));

  const setImage = (index: number, changes: Partial<{ src: string; alt: string }>) =>
    patch({ images: form.images.map((img, i) => (i === index ? { ...img, ...changes } : img)) });

  const validate = (): string => {
    if (!form.title.trim()) return 'Escreva um título para a memória.';
    if (!form.date) return 'Informe a data.';
    const filled = form.images.filter((img) => img.src.trim());
    if (filled.length === 0) return 'Adicione pelo menos uma foto (cole o link dela).';
    if (filled.some((img) => !isValidImageSrc(img.src.trim()))) return IMAGE_SRC_MESSAGE;
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    setFormError(problem);
    if (problem) return;

    setSaving(true);
    try {
      const title = form.title.trim();
      const payload = {
        title,
        date: localInputToIso(form.date, editingEntry?.date)!,
        // A API exige estes dois textos: sem preenchimento, usamos a data por extenso e o título.
        dateDisplay: form.dateDisplay.trim() || formatDateDisplay(form.date) || title,
        description: form.description.trim() ? form.description : title,
        images: fillMissingAlt(form.images.filter((img) => img.src.trim()).map((img) => ({ ...img, src: img.src.trim() })), title),
        tripId: form.tripId || null,
        visitId: form.visitId || null,
        isFeatured: form.isFeatured,
        orderIndex: form.orderIndex || 0,
      };
      if (editingEntry) {
        await galleryApi.update(editingEntry.id, payload);
        toast.success('Memória salva.');
      } else {
        await galleryApi.create(payload);
        toast.success('Memória criada.');
      }
      setFormOpen(false);
      await loadGallery();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a memória.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await galleryApi.delete(toDelete.id);
      toast.success('Memória excluída.');
      setToDelete(null);
      if (entries.length === 1 && page > 1) list.setPage(page - 1);
      else await loadGallery();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir a memória.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleFeatured = async (entry: GalleryEntry) => {
    setBusyId(entry.id);
    try {
      await galleryApi.update(entry.id, { isFeatured: !entry.isFeatured });
      toast.success(entry.isFeatured ? 'Destaque removido.' : 'Marcada como destaque. Só uma memória fica em destaque por vez.');
      await loadGallery();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível mudar o destaque.');
    } finally {
      setBusyId(null);
    }
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      const positions = reorderPositions(entries.map((e) => e.orderIndex), (page - 1) * pagination.limit);
      await galleryApi.reorder(entries.map((e, i) => ({ id: e.id, orderIndex: positions[i] })));
      toast.success('Nova ordem salva.');
      setReordering(false);
      await loadGallery();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar a ordem.');
    } finally {
      setSavingOrder(false);
    }
  };

  const hasFilters = !!(search || isFeatured || tripId || visitId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Galeria"
        description="Memórias com fotos que aparecem no site"
        actions={
          <>
            {entries.length > 1 && !reordering ? (
              <Button icon={<ListOrdered className="w-4 h-4" aria-hidden="true" />} onClick={() => setReordering(true)}>Mudar a ordem</Button>
            ) : null}
            <Button variant="primary" icon={<Plus className="w-5 h-5" aria-hidden="true" />} onClick={openCreate}>Nova memória</Button>
          </>
        }
      />

      <FilterBar
        searchLabel="Buscar memórias"
        searchPlaceholder="Buscar por título ou descrição"
        searchValue={search}
        onSearch={(value) => list.setFilter('search', value)}
        onClear={list.clear}
        hasFilters={hasFilters}
      >
        <select className="select w-full lg:w-52" value={isFeatured} onChange={(e) => list.setFilter('isFeatured', e.target.value)} aria-label="Filtrar por destaque">
          <option value="">Todas as memórias</option>
          <option value="true">Só a que está em destaque</option>
          <option value="false">Só as que não estão em destaque</option>
        </select>
      </FilterBar>

      {error ? <ErrorState message={error} onRetry={loadGallery} /> : null}

      <div className="card p-4" aria-busy={loading}>
        {reordering && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="status">
            <span className="text-sm text-yellow-900">Use as setas de cada foto para mudar a posição e depois salve.</span>
            <div className="flex gap-2">
              <Button disabled={savingOrder} onClick={() => { setReordering(false); loadGallery(); }}>Cancelar</Button>
              <Button variant="primary" loading={savingOrder} loadingText="Salvando..." onClick={saveOrder}>Salvar ordem</Button>
            </div>
          </div>
        )}

        {loading && entries.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Carregando galeria">
            {[1, 2, 3].map((i) => <div key={i} className="loading-skeleton aspect-video w-full" />)}
          </div>
        ) : entries.length === 0 && !error ? (
          <EmptyState
            icon={<Images className="w-6 h-6" />}
            title={hasFilters ? 'Nenhuma memória encontrada' : 'A galeria está vazia'}
            text={hasFilters ? 'Tente outra busca ou limpe os filtros.' : 'Uma memória precisa só de título, data e uma foto.'}
            action={hasFilters ? <Button onClick={list.clear}>Limpar filtros</Button> : <Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate}>Criar a primeira memória</Button>}
          />
        ) : (
          <ul className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${loading ? 'opacity-60' : ''}`}>
            {entries.map((entry, index) => (
              <li key={entry.id} className="card overflow-hidden flex flex-col">
                <div className="aspect-video relative bg-surface-100">
                  {entry.images[0] && <EntryImage src={entry.images[0].src} alt={entry.images[0].alt} />}
                  {entry.isFeatured && (
                    <span className="absolute top-2 right-2 badge bg-yellow-100 text-yellow-900 gap-1">
                      <Star className="w-3 h-3 fill-current" aria-hidden="true" /> Destaque
                    </span>
                  )}
                  {reordering && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/95 rounded-lg p-1 shadow">
                      <button type="button" className="btn-icon" onClick={() => setEntries((cur) => moveItem(cur, index, 'up'))} disabled={index === 0} aria-label={`Subir ${entry.title}`}><ArrowUp className="w-4 h-4" aria-hidden="true" /></button>
                      <span className="text-sm font-semibold px-1 tabular-nums" aria-label={`Posição ${index + 1}`}>{index + 1}</span>
                      <button type="button" className="btn-icon" onClick={() => setEntries((cur) => moveItem(cur, index, 'down'))} disabled={index === entries.length - 1} aria-label={`Descer ${entry.title}`}><ArrowDown className="w-4 h-4" aria-hidden="true" /></button>
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <h2 className="font-semibold text-surface-900 line-clamp-1">{entry.title}</h2>
                  <p className="text-sm text-surface-600 line-clamp-2">{entry.description}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-surface-600">
                    <time dateTime={entry.date}>{entry.dateDisplay || formatDateBR(entry.date)}</time>
                    {entry.trip && <span className="badge badge-info">{entry.trip.title}</span>}
                    {entry.visit && <span className="badge badge-neutral">{entry.visit.title}</span>}
                  </div>
                  <div className="flex items-center gap-1 pt-3 mt-auto border-t border-surface-100">
                    <Button
                      small
                      variant="ghost"
                      className={`flex-1 ${entry.isFeatured ? 'text-yellow-800' : ''}`}
                      loading={busyId === entry.id && !toDelete}
                      loadingText="Salvando..."
                      icon={<Star className={`w-4 h-4 ${entry.isFeatured ? 'fill-current' : ''}`} aria-hidden="true" />}
                      onClick={() => toggleFeatured(entry)}
                      aria-pressed={entry.isFeatured}
                      aria-label={`${entry.isFeatured ? 'Tirar o destaque de' : 'Destacar'} ${entry.title}`}
                    >
                      {entry.isFeatured ? 'Em destaque' : 'Destacar'}
                    </Button>
                    <button type="button" className="btn-icon" onClick={() => openEdit(entry)} aria-label={`Editar ${entry.title}`}><Pencil className="w-4 h-4" aria-hidden="true" /></button>
                    <button type="button" className="btn-icon text-red-700 hover:bg-red-50" onClick={() => setToDelete(entry)} aria-label={`Excluir ${entry.title}`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="-mx-4 -mb-4 mt-4"><Pagination pagination={pagination} onChange={list.setPage} /></div>
      </div>

      <Modal
        open={formOpen}
        onOpenChange={(open) => { if (!open) closeForm(); }}
        title={editingEntry ? 'Editar memória' : 'Nova memória'}
        description="Só título, data e foto são necessários."
        widthClass="max-w-2xl"
        footer={
          <>
            <Button onClick={closeForm} disabled={saving}>Cancelar</Button>
            <Button type="submit" form="gallery-form" variant="primary" loading={saving} loadingText="Salvando...">{editingEntry ? 'Salvar' : 'Criar memória'}</Button>
          </>
        }
      >
        <form id="gallery-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <div className="alert-error" role="alert">{formError}</div>}
          <Field id="g-title" label="Título" required>
            <input id="g-title" className="input" value={form.title} onChange={(e) => patch({ title: e.target.value })} autoComplete="off" />
          </Field>
          <Field id="g-date" label="Data" required>
            <input id="g-date" type="datetime-local" className="input" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
          </Field>

          <fieldset className="space-y-2">
            <legend className="label">Fotos <span className="text-red-700" aria-hidden="true">*</span></legend>
            <p className="hint">Cole o link de cada foto. A primeira é a capa.</p>
            {form.images.map((img, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <ImageThumb src={img.src} className="w-10 h-10" />
                <input type="text" className="input flex-1 min-w-0" value={img.src} onChange={(e) => setImage(idx, { src: e.target.value })} placeholder="Link da foto" aria-label={`Link da foto ${idx + 1}`} />
                <button type="button" className="btn-icon text-red-700 hover:bg-red-50" onClick={() => patch({ images: form.images.filter((_, i) => i !== idx) })} disabled={form.images.length <= 1} aria-label={`Remover foto ${idx + 1}`}>
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <Button small icon={<ImagePlus className="w-4 h-4" aria-hidden="true" />} onClick={() => patch({ images: [...form.images, { src: '', alt: '' }] })}>Adicionar outra foto</Button>
          </fieldset>

          <FormSection title="Texto" summary="Descrição e data como aparece no site" filled={countFilled([form.description, form.dateDisplay])}>
            <Field id="g-description" label="Descrição" hint="Se ficar vazia, usamos o título.">
              <textarea id="g-description" className="input" value={form.description} onChange={(e) => patch({ description: e.target.value })} rows={4} />
            </Field>
            <Field id="g-dateDisplay" label="Data como aparece no site" hint={`Se ficar vazia, usamos “${formatDateDisplay(form.date) || 'a data por extenso'}”.`}>
              <input id="g-dateDisplay" className="input" value={form.dateDisplay} onChange={(e) => patch({ dateDisplay: e.target.value })} placeholder="Ex.: 15 de janeiro de 2026" />
            </Field>
            <div className="form-group !mb-0">
              <p className="label">Descrição das fotos (opcional)</p>
              <p className="hint mb-2">Ajuda quem usa leitor de tela. Se ficar vazia, usamos o título.</p>
              <div className="space-y-2">
                {form.images.map((img, idx) => img.src.trim() ? (
                  <input key={idx} type="text" className="input" value={img.alt} onChange={(e) => setImage(idx, { alt: e.target.value })} placeholder={`Descrição da foto ${idx + 1}`} aria-label={`Descrição da foto ${idx + 1} (opcional)`} />
                ) : null)}
              </div>
            </div>
          </FormSection>

          <FormSection title="Ligações e destaque" summary="Viagem, visita e posição" filled={countFilled([form.tripId, form.visitId, form.isFeatured])}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="g-tripId" label="Viagem">
                <select id="g-tripId" className="select" value={form.tripId} onChange={(e) => patch({ tripId: e.target.value })}>
                  <option value="">Sem viagem</option>
                  {trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  {form.tripId && !trips.some((t) => t.id === form.tripId) && <option value={form.tripId}>{editingEntry?.trip?.title ?? 'Viagem ligada'}</option>}
                </select>
              </Field>
              <Field id="g-visitId" label="Visita">
                <select id="g-visitId" className="select" value={form.visitId} onChange={(e) => patch({ visitId: e.target.value })}>
                  <option value="">Sem visita</option>
                  {visits.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
                  {form.visitId && !visits.some((v) => v.id === form.visitId) && <option value={form.visitId}>{editingEntry?.visit?.title ?? 'Visita ligada'}</option>}
                </select>
              </Field>
              <Field id="g-orderIndex" label="Posição na galeria" hint="Número menor aparece primeiro.">
                <input id="g-orderIndex" type="number" inputMode="numeric" min="0" className="input" value={form.orderIndex} onChange={(e) => patch({ orderIndex: e.target.value ? parseInt(e.target.value, 10) : 0 })} />
              </Field>
            </div>
            <label className="checkbox-label min-h-[32px]">
              <input type="checkbox" className="checkbox-input" checked={form.isFeatured} onChange={(e) => patch({ isFeatured: e.target.checked })} />
              <span className="text-sm text-surface-700">Destacar na página inicial (só uma memória fica em destaque)</span>
            </label>
          </FormSection>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        title="Excluir esta memória?"
        description={`“${toDelete?.title ?? ''}” será apagada de vez e sai do site. Isso não pode ser desfeito.`}
        confirmLabel="Sim, excluir"
        busyLabel="Excluindo..."
        busy={!!toDelete && busyId === toDelete.id}
        onConfirm={remove}
      />
    </div>
  );
}

function EntryImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="w-full h-full flex items-center justify-center text-sm text-surface-600">Foto não encontrada</div>;
  return <img src={resolveAssetSrc(src)} alt={alt} className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />;
}
