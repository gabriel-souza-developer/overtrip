import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { galleryApi, GalleryEntry, Trip, Visit, Pagination } from '../api';
import { useToast } from '../hooks/useToast';
import { resolveAssetSrc } from '../lib/assetUrl';

function PlusIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
}

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

function StarIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;
}

function StarOutlineIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;
}

function GripIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>;
}

export default function Gallery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<GalleryEntry | null>(null);
  const [formData, setFormData] = useState<Partial<GalleryEntry>>({});
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const { toast } = useToast();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const isFeatured = searchParams.get('isFeatured') === 'true' ? true : searchParams.get('isFeatured') === 'false' ? false : undefined;
  const tripId = searchParams.get('tripId') || undefined;
  const visitId = searchParams.get('visitId') || undefined;
  const search = searchParams.get('search') || '';

  useEffect(() => {
    loadGallery();
    loadTripsAndVisits();
  }, [page, isFeatured, tripId, visitId, search]);

  const loadGallery = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await galleryApi.list({ page, limit: 20, isFeatured, tripId, visitId, search: search || undefined });
      setEntries(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar galeria');
    } finally {
      setLoading(false);
    }
  };

  const loadTripsAndVisits = async () => {
    try {
      const [tripData, visitData] = await Promise.all([
        galleryApi.list({ limit: 100 }),
        galleryApi.list({ limit: 100 }),
      ]);
      // We'd need tripApi and visitApi for this, but let's skip for now
    } catch {
      // Ignore
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

  const resetForm = () => {
    setFormData({
      title: '',
      date: new Date().toISOString().slice(0, 16),
      dateDisplay: '',
      description: '',
      images: [{ src: '', alt: '' }],
      tripId: '',
      visitId: '',
      isFeatured: false,
      orderIndex: entries.length,
    });
    setEditingEntry(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (entry: GalleryEntry) => {
    setEditingEntry(entry);
    setFormData({
      title: entry.title,
      date: entry.date.slice(0, 16),
      dateDisplay: entry.dateDisplay,
      description: entry.description,
      images: entry.images,
      tripId: entry.tripId || '',
      visitId: entry.visitId || '',
      isFeatured: entry.isFeatured,
      orderIndex: entry.orderIndex,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingEntry(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: value ? parseInt(value, 10) : 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleImageChange = (index: number, field: 'src' | 'alt', value: string) => {
    const newImages = [...(formData.images || [])];
    newImages[index] = { ...newImages[index], [field]: value };
    setFormData(prev => ({ ...prev, images: newImages }));
  };

  const addImage = () => {
    setFormData(prev => ({ ...prev, images: [...(prev.images || []), { src: '', alt: '' }] }));
  };

  const removeImage = (index: number) => {
    const newImages = (formData.images || []).filter((_, i) => i !== index);
    if (newImages.length > 0) {
      setFormData(prev => ({ ...prev, images: newImages }));
    }
  };

  const validate = () => {
    if (!formData.title?.trim()) { alert('Título é obrigatório'); return false; }
    if (!formData.dateDisplay?.trim()) { alert('Data de exibição é obrigatória'); return false; }
    if (!formData.description?.trim()) { alert('Descrição é obrigatória'); return false; }
    const validImages = (formData.images || []).filter(img => img.src.trim() && img.alt.trim());
    if (validImages.length === 0) { alert('Pelo menos uma imagem com URL e alt é obrigatória'); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        title: formData.title!,
        date: formData.date!,
        dateDisplay: formData.dateDisplay!,
        description: formData.description!,
        images: (formData.images || []).filter(img => img.src.trim() && img.alt.trim()),
        tripId: formData.tripId || null,
        visitId: formData.visitId || null,
        isFeatured: formData.isFeatured || false,
        orderIndex: formData.orderIndex || 0,
      };

      if (editingEntry) {
        await galleryApi.update(editingEntry.id, payload);
        toast.success('Memória atualizada');
      } else {
        await galleryApi.create(payload);
        toast.success('Memória criada');
      }
      closeForm();
      loadGallery();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Excluir a memória "${title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await galleryApi.delete(id);
      toast.success('Memória excluída');
      loadGallery();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  };

  const toggleFeatured = async (entry: GalleryEntry) => {
    try {
      await galleryApi.update(entry.id, { isFeatured: !entry.isFeatured });
      toast.success(entry.isFeatured ? 'Destaque removido' : 'Marcado como destaque');
      loadGallery();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar destaque');
    }
  };

  const handleReorder = async () => {
    setReordering(true);
    try {
      const reorderData = entries.map((e, i) => ({ id: e.id, orderIndex: i }));
      await galleryApi.reorder(reorderData);
      toast.success('Ordem atualizada');
      setReordering(false);
      loadGallery();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao reordenar');
      setReordering(false);
    }
  };

  const moveEntry = (index: number, direction: 'up' | 'down') => {
    const newEntries = [...entries];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newEntries.length) return;
    [newEntries[index], newEntries[newIndex]] = [newEntries[newIndex], newEntries[index]];
    setEntries(newEntries);
  };

  if (loading && entries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">Galeria</h1>
            <p className="page-description">Gerencie memórias editoriais do site</p>
          </div>
          <button className="btn-primary" onClick={openCreateForm}>
            <PlusIcon className="w-5 h-5" /> Nova Memória
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4">
              <div className="loading-skeleton aspect-video w-full rounded mb-3"></div>
              <div className="loading-skeleton h-5 w-3/4 mb-2"></div>
              <div className="loading-skeleton h-4 w-full mb-1"></div>
              <div className="loading-skeleton h-4 w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Galeria</h1>
          <p className="page-description">Gerencie memórias editoriais do site OVERTRIP</p>
        </div>
        <button className="btn-primary" onClick={openCreateForm}>
          <PlusIcon className="w-5 h-5" /> Nova Memória
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-0 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
            <input type="search" name="search" className="input pl-10" placeholder="Buscar por título, descrição..." defaultValue={search} aria-label="Buscar memórias" />
          </div>
          <select name="isFeatured" className="select w-full sm:w-48" value={isFeatured !== undefined ? String(isFeatured) : ''} onChange={(e) => handleFilterChange('isFeatured', e.target.value)} aria-label="Filtrar por destaque">
            <option value="">Todas</option>
            <option value="true">Em destaque</option>
            <option value="false">Não destacadas</option>
          </select>
        </form>
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}

      {/* Gallery Grid */}
      <div className="card p-4">
        {reordering && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-yellow-800">Modo reordenação: arraste ou use as setas</span>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => { setReordering(false); loadGallery(); }}>Cancelar</button>
              <button className="btn-primary" onClick={handleReorder} disabled={saving}>Salvar Ordem</button>
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="empty-state py-12">
            <svg className="w-12 h-12 mx-auto text-surface-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-surface-500">{search || isFeatured !== undefined ? 'Nenhuma memória encontrada com estes filtros' : 'Nenhuma memória cadastrada'}</p>
            {!search && isFeatured === undefined && <button className="btn-primary mt-4" onClick={openCreateForm}><PlusIcon className="w-4 h-4" /> Criar primeira memória</button>}
          </div>
        ) : (
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${reordering ? 'relative' : ''}`}>
            {entries.map((entry, index) => (
              <article key={entry.id} className={`relative card overflow-hidden transition-shadow hover:shadow-md ${reordering ? 'opacity-80' : ''}`}>
                {reordering && (
                  <div className="absolute top-2 left-2 right-2 flex justify-between z-10">
                    <div className="flex gap-1">
                      <button className="btn-ghost p-1.5 bg-white/90" onClick={() => moveEntry(index, 'up')} disabled={index === 0} aria-label="Mover para cima"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg></button>
                      <button className="btn-ghost p-1.5 bg-white/90" onClick={() => moveEntry(index, 'down')} disabled={index === entries.length - 1} aria-label="Mover para baixo"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg></button>
                    </div>
                    <span className="badge badge-neutral bg-white/90">{index + 1}</span>
                  </div>
                )}

                <div className="aspect-video relative overflow-hidden bg-surface-100">
                  {entry.images[0] && (
                    <img
                      src={resolveAssetSrc(entry.images[0].src)}
                      alt={entry.images[0].alt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {entry.isFeatured && (
                    <div className="absolute top-2 right-2">
                      <span className="badge badge-warning bg-yellow-500 text-white">
                        <StarIcon className="w-3 h-3" fill="currentColor" /> Destaque
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="font-semibold text-surface-900 line-clamp-1">{entry.title}</h3>
                  <p className="text-sm text-surface-500 line-clamp-2">{entry.description}</p>
                  <div className="flex items-center gap-2 text-xs text-surface-500">
                    <time>{new Date(entry.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</time>
                    {entry.trip && <span className="badge badge-info">{entry.trip.title}</span>}
                    {entry.visit && <span className="badge badge-neutral">{entry.visit.title}</span>}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-surface-100">
                    <button 
                      className={`btn-ghost p-2 flex-1 ${entry.isFeatured ? 'text-yellow-600' : 'text-surface-500'}`}
                      onClick={() => toggleFeatured(entry)}
                      aria-label={entry.isFeatured ? 'Remover destaque' : 'Marcar como destaque'}
                    >
                      {entry.isFeatured ? <StarIcon className="w-4 h-4 fill-current" /> : <StarOutlineIcon className="w-4 h-4" />}
                      <span className="hidden sm:inline">Destaque</span>
                    </button>
                    <button className="btn-ghost p-2" onClick={() => openEditForm(entry)} aria-label={`Editar ${entry.title}`}>
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button className="btn-ghost p-2 text-red-600 hover:bg-red-50" onClick={() => handleDelete(entry.id, entry.title)} aria-label={`Excluir ${entry.title}`}>
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {entries.length > 1 && !reordering && (
          <div className="mt-4 pt-4 border-t border-surface-200 flex justify-end">
            <button className="btn-secondary" onClick={() => setReordering(true)}>
              <GripIcon className="w-4 h-4" /> Reordenar
            </button>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-4 pt-4 border-t border-surface-200">
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

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm} role="dialog" aria-modal="true" aria-labelledby="form-title">
          <div className="modal max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="form-title" className="text-lg font-semibold text-surface-900">{editingEntry ? 'Editar Memória' : 'Nova Memória'}</h2>
              <button className="btn-ghost p-2" onClick={closeForm} aria-label="Fechar">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="form-group">
                <label htmlFor="g-title" className="label">Título *</label>
                <input id="g-title" name="title" className="input" value={formData.title} onChange={handleChange} required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="g-date" className="label">Data *</label>
                  <input id="g-date" name="date" type="datetime-local" className="input" value={formData.date} onChange={handleChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="g-dateDisplay" className="label">Data Exibição *</label>
                  <input id="g-dateDisplay" name="dateDisplay" className="input" value={formData.dateDisplay} onChange={handleChange} placeholder="Ex: 15 de janeiro de 2026" required />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="g-description" className="label">Descrição *</label>
                <textarea id="g-description" name="description" className="input" value={formData.description} onChange={handleChange} rows={4} required />
              </div>

              <fieldset className="space-y-3">
                <legend className="label">Imagens *</legend>
                {(formData.images || []).map((img, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="label">URL da Imagem</label>
                      <input type="url" className="input" value={img.src} onChange={(e) => handleImageChange(idx, 'src', e.target.value)} placeholder="https://exemplo.com/imagem.jpg" required />
                    </div>
                    <div className="col-span-12 sm:col-span-5">
                      <label className="label">Texto Alternativo (alt)</label>
                      <input type="text" className="input" value={img.alt} onChange={(e) => handleImageChange(idx, 'alt', e.target.value)} placeholder="Descrição da imagem" required />
                    </div>
                    <div className="col-span-12 sm:col-span-2 flex items-end">
                      <button type="button" className="btn-ghost p-2 text-red-600 hover:bg-red-50 w-full" onClick={() => removeImage(idx)} disabled={(formData.images || []).length <= 1} aria-label="Remover imagem">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn-secondary" onClick={addImage}>
                  <PlusIcon className="w-4 h-4" /> Adicionar imagem
                </button>
              </fieldset>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="g-tripId" className="label">Viagem (opcional)</label>
                  <select id="g-tripId" name="tripId" className="select" value={formData.tripId} onChange={handleChange}>
                    <option value="">— Sem viagem —</option>
                    {/* Trips would be loaded here */}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="g-visitId" className="label">Visita (opcional)</label>
                  <select id="g-visitId" name="visitId" className="select" value={formData.visitId} onChange={handleChange}>
                    <option value="">— Sem visita —</option>
                    {/* Visits would be loaded here */}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="g-orderIndex" className="label">Ordem</label>
                  <input id="g-orderIndex" name="orderIndex" type="number" min="0" className="input" value={formData.orderIndex ?? 0} onChange={handleChange} />
                </div>
                <div className="form-group flex items-end">
                  <label className="checkbox-label">
                    <input name="isFeatured" type="checkbox" className="checkbox-input" checked={formData.isFeatured} onChange={handleChange} />
                    <span className="text-sm text-surface-700">Destacar na home</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeForm}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : (editingEntry ? 'Atualizar' : 'Criar')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}