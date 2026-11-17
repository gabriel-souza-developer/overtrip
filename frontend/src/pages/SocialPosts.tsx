import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Share2 } from 'lucide-react';
import { request, tripApi, type Trip } from '../api';
import { tripDay } from '../lib/tripCalendar';
import { socialPostsApi, type SocialPlatform, type SocialPost } from '../api/socialPosts';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import Field from '../components/Field';
import Modal from '../components/Modal';
import ErrorState from '../components/ErrorState';
import SocialArtCreator from '../components/SocialArtCreator';
import ConfirmDialog from '../components/ConfirmDialog';

const platforms: { value: SocialPlatform; label: string }[] = [
  { value: 'INSTAGRAM', label: 'Instagram' }, { value: 'FACEBOOK', label: 'Facebook' }, { value: 'TIKTOK', label: 'TikTok' },
];
const blank = (): Record<SocialPlatform, string> => ({ INSTAGRAM: '', FACEBOOK: '', TIKTOK: '' });
const blankImages = (): Record<SocialPlatform, string | null> => ({ INSTAGRAM: null, FACEBOOK: null, TIKTOK: null });

export default function SocialPosts() {
  const [items, setItems] = useState<SocialPost[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<SocialPost | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [captions, setCaptions] = useState(blank);
  const [images, setImages] = useState(blankImages);
  const [uploading, setUploading] = useState<SocialPlatform | null>(null);
  const [briefing, setBriefing] = useState('');
  const [generating, setGenerating] = useState<SocialPlatform | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<SocialPost | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ kind: 'discard' } | { kind: 'trip'; trip: Trip } | { kind: 'suggest'; platform: SocialPlatform } | null>(null);
  const [tripQuery, setTripQuery] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState('');
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState('');
  const [tripMore, setTripMore] = useState(false);
  const [tripSearched, setTripSearched] = useState(false);
  const hasChanges = title !== (editing?.title ?? '') || !!briefing.trim() || platforms.some(({ value }) => captions[value] !== (editing?.variants.find(v => v.platform === value)?.caption ?? '') || images[value] !== (editing?.variants.find(v => v.platform === value)?.socialMediaId ?? null));

  const closeEditor = () => {
    if (busy || generating || uploading) return;
    if (hasChanges) { setPendingConfirmation({ kind: 'discard' }); return; }
    setOpen(false);
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await socialPostsApi.list(page); setItems(result.data); setPages(Math.max(1, result.pagination.totalPages)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os rascunhos.'); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  const edit = (post?: SocialPost) => {
    setEditing(post ?? null); setTitle(post?.title ?? '');
    const next = blank(); post?.variants.forEach(variant => { if (variant.platform in next) next[variant.platform] = variant.caption; });
    const nextImages = blankImages(); post?.variants.forEach(variant => { if (variant.platform in nextImages) nextImages[variant.platform] = variant.socialMediaId ?? null; });
    setImages(nextImages); setNotice('');
    setCaptions(next); setBriefing(''); setFormError(''); setTripQuery(''); setTrips([]); setTripId(''); setTripError(''); setTripMore(false); setTripSearched(false); setOpen(true);
  };
  const searchTrips = async () => {
    setTripLoading(true); setTripError(''); setTripId(''); setTripSearched(false);
    try {
      const result = await tripApi.list({ page: 1, limit: 100, search: tripQuery.trim() });
      setTrips(result.data); setTripMore(result.pagination.totalPages > 1); setTripSearched(true);
    } catch (err) { setTrips([]); setTripError(err instanceof Error ? err.message : 'Não foi possível buscar as viagens.'); }
    finally { setTripLoading(false); }
  };
  const applyTrip = (trip: Trip) => {
    const day = tripDay(trip.startDateISO);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : '';
    const destination = [trip.city, trip.region].filter(Boolean).join(' - ');
    const facts = [`Viagem: ${trip.title}`, destination && `Destino: ${destination}`, date && `Data de saída: ${date}`, trip.description && `Descrição: ${trip.description}`].filter(Boolean).join('\n');
    setTitle(trip.title.slice(0, 160));
    setBriefing(facts.slice(0, 3000));
    setFormError('');
  };
  const useTrip = () => {
    const trip = trips.find(item => item.id === tripId);
    if (!trip) return;
    if (title.trim() || briefing.trim()) { setPendingConfirmation({ kind: 'trip', trip }); return; }
    applyTrip(trip);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const variants = platforms.map(({ value }) => ({ platform: value, caption: captions[value].trim(), socialMediaId: images[value] })).filter(v => v.caption || v.socialMediaId);
    if (!title.trim() || !variants.length) { setFormError('Informe um título e pelo menos uma legenda ou imagem.'); return; }
    setBusy(true); setFormError('');
    try {
      const input = { title: title.trim(), variants };
      if (editing) await socialPostsApi.update(editing.id, { ...input, version: editing.version });
      else await socialPostsApi.create(input);
      setOpen(false); await load(); setNotice('Rascunho salvo. Abra novamente para revisar a versão salva.');
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Não foi possível salvar o rascunho.'); }
    finally { setBusy(false); }
  };
  const uploadImage = async (platform: SocialPlatform, file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      setFormError('Escolha uma imagem JPEG, PNG ou WebP de até 15 MB.');
      return;
    }
    setUploading(platform); setFormError('');
    try {
      const media = await socialPostsApi.uploadImage(file);
      setImages(current => ({ ...current, [platform]: media.id }));
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.'); }
    finally { setUploading(null); }
  };
  const generateSuggestion = async (platform: SocialPlatform) => {
    if (!briefing.trim()) { setFormError('Descreva o post para receber uma sugestão.'); return; }
    const original = captions[platform];
    setGenerating(platform); setFormError('');
    try {
      const result = await request<{ caption: string }>('/ai/social-caption', { method: 'POST', body: JSON.stringify({ briefing: briefing.trim(), network: platform.toLowerCase() }) });
      setCaptions(current => {
        if (current[platform] !== original) return current;
        return { ...current, [platform]: result.caption };
      });
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Não foi possível gerar a sugestão.'); }
    finally { setGenerating(null); }
  };
  const suggest = (platform: SocialPlatform) => {
    if (!briefing.trim()) { setFormError('Descreva o post para receber uma sugestão.'); return; }
    if (captions[platform].trim()) { setPendingConfirmation({ kind: 'suggest', platform }); return; }
    void generateSuggestion(platform);
  };
  const confirmAction = () => {
    const action = pendingConfirmation;
    if (!action || busy || generating || uploading) return;
    setPendingConfirmation(null);
    if (action.kind === 'discard') setOpen(false);
    else if (action.kind === 'trip') applyTrip(action.trip);
    else void generateSuggestion(action.platform);
  };
  const approve = async (post: SocialPost) => {
    setBusy(true); setError('');
    try { await socialPostsApi.approve(post.id, post.version); await load(); setNotice('Versão marcada como revisada. A publicação nas redes ainda não está disponível.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível aprovar.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!pendingRemoval) return;
    setBusy(true); setError('');
    try { await socialPostsApi.remove(pendingRemoval.id, pendingRemoval.version); setPendingRemoval(null); setNotice('Rascunho excluído.'); if (items.length === 1 && page > 1) setPage(page - 1); else await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir.'); setPendingRemoval(null); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="Redes sociais" description="Prepare legendas e imagens para suas redes." actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => edit()}>Novo post</Button>} />
    <p className="rounded-xl bg-surface-100 p-4 text-sm text-surface-700">Crie um rascunho, salve e confira as versões de cada rede antes de marcá-lo como revisado. A conexão e a publicação nas redes ainda não estão disponíveis.</p>
    <section className="card p-5" aria-labelledby="social-connections-title">
      <h2 id="social-connections-title" className="text-base font-semibold text-surface-900">Conexões com redes sociais</h2>
      <p className="mt-1 text-sm text-surface-600">A conexão de contas está em preparação. Você já pode criar e revisar rascunhos enquanto isso.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {['Instagram', 'Facebook'].map(network => <li key={network} className="flex items-center justify-between gap-3 rounded-lg border border-surface-200 px-4 py-3">
          <span className="font-medium text-surface-900">{network}</span>
          <span className="text-sm text-surface-600">Em preparação</span>
        </li>)}
      </ul>
    </section>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    <details className="card p-5"><summary className="cursor-pointer font-semibold text-surface-900">Criar uma capa</summary><div className="mt-4"><SocialArtCreator /></div></details>
    {error && <ErrorState message={error} onRetry={load} />}
    {loading ? <p role="status">Carregando posts...</p> : !error && items.length === 0 ? <div className="card p-10 text-center text-surface-600"><Share2 className="w-8 h-8 mx-auto mb-3" aria-hidden="true" />Nenhum post criado ainda.</div> : <div className="grid gap-3">{items.map(post => <article key={post.id} className="card p-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h2 className="font-semibold text-surface-900 break-words">{post.title}</h2><p className="mt-1 text-sm text-surface-600">{post.approvedAt ? 'Revisado' : 'Aguardando revisão'} · {post.variants.map(v => platforms.find(p => p.value === v.platform)?.label ?? v.platform).join(', ')}</p></div>
      <div className="flex flex-wrap gap-2"><Button small onClick={() => edit(post)}>Abrir e revisar</Button><Button small variant="danger" disabled={busy} onClick={() => setPendingRemoval(post)}>Excluir</Button></div>
    </article>)}</div>}
    {pages > 1 && <div className="flex items-center gap-3"><Button small disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {page} de {pages}</span><Button small disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>}
    <Modal open={!!pendingRemoval} onOpenChange={value => { if (!value && !busy) setPendingRemoval(null); }} title="Excluir post" description="O rascunho e suas legendas serão excluídos." footer={<><Button disabled={busy} onClick={() => setPendingRemoval(null)}>Cancelar</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Excluir</Button></>}><p>Excluir {pendingRemoval?.title}?</p></Modal>
    <Modal open={open} onOpenChange={value => { if (!value) closeEditor(); }} title={editing ? 'Revisar post' : 'Novo post'} description="Preencha somente as redes que deseja usar." widthClass="max-w-2xl">
      <form className="space-y-5" onSubmit={save}>
        {!editing && <details className="rounded-xl border border-surface-200 p-4">
          <summary className="cursor-pointer font-semibold text-surface-900">Usar dados de uma viagem</summary>
          <p className="mt-2 text-sm text-surface-600">Busque uma viagem e copie seus dados para a ideia. Confira a data e as informações antes de publicar.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field id="social-trip-search" label="Buscar viagem"><input id="social-trip-search" className="input" value={tripQuery} onChange={event => setTripQuery(event.target.value)} placeholder="Nome ou destino" maxLength={100} /></Field></div><Button type="button" disabled={tripLoading} onClick={() => void searchTrips()}>{tripLoading ? 'Buscando...' : 'Buscar'}</Button></div>
          {tripError && <p role="alert" className="mt-2 text-sm text-red-700">{tripError}</p>}
          {trips.length > 0 && <div className="mt-3 space-y-2"><Field id="social-trip" label="Viagem"><select id="social-trip" className="input" value={tripId} onChange={event => setTripId(event.target.value)}><option value="">Selecione uma viagem</option>{trips.map(trip => <option key={trip.id} value={trip.id}>{trip.title} · {tripDay(trip.startDateISO).split('-').reverse().join('/')}</option>)}</select></Field><Button type="button" disabled={!tripId} onClick={useTrip}>Usar dados da viagem</Button>{tripMore && <p className="text-xs text-surface-600">Exibindo até 100 resultados. Refine a busca para encontrar outra viagem.</p>}</div>}
          {!tripLoading && !tripError && trips.length === 0 && <p className="mt-2 text-xs text-surface-600">{tripSearched ? 'Nenhuma viagem encontrada. Tente outra busca.' : 'Digite um nome ou destino e clique em Buscar. Deixe em branco para listar viagens.'}</p>}
        </details>}
        <Field id="social-title" label="Título interno" required><input id="social-title" className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required /></Field>
        <Field id="social-briefing" label="Ideia para a legenda" hint="Descreva a viagem, o público e o que deseja comunicar. Revise sugestões antes de salvar."><textarea id="social-briefing" className="input" rows={3} maxLength={3000} value={briefing} onChange={e => setBriefing(e.target.value)} /></Field>
        <p className="text-sm text-surface-600">Ao solicitar uma sugestão, sua descrição será enviada ao provedor de IA configurado. Não inclua dados pessoais de clientes.</p>
        {platforms.map(({ value, label }) => <div key={value} className="space-y-3 rounded-xl border border-surface-200 p-4"><Field id={`caption-${value}`} label={`Legenda para ${label}`}><textarea id={`caption-${value}`} className="input" rows={4} maxLength={5000} value={captions[value]} onChange={e => setCaptions(c => ({ ...c, [value]: e.target.value }))} /><div className="mt-2"><Button type="button" small disabled={busy || !!generating || !!uploading} onClick={() => void suggest(value)}>{generating === value ? 'Gerando...' : 'Sugerir legenda'}</Button></div></Field><Field id={`image-${value}`} label={`Imagem para ${label}`} hint="JPEG, PNG ou WebP até 15 MB. A imagem é privada até a publicação."><input id={`image-${value}`} type="file" className="input" accept="image/jpeg,image/png,image/webp" disabled={busy || !!generating || !!uploading} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void uploadImage(value, file); }} /></Field>{uploading === value && <p role="status" className="text-sm text-surface-600">Enviando imagem...</p>}{images[value] && <div className="space-y-2"><img src={socialPostsApi.imageUrl(images[value]!)} alt={`Imagem escolhida para ${label}`} className="max-h-60 max-w-full rounded-lg object-contain" /><Button type="button" small disabled={busy || !!uploading} onClick={() => setImages(current => ({ ...current, [value]: null }))}>Remover imagem</Button></div>}</div>)}
        {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        {editing?.approvedAt && <p className="text-sm text-surface-600">Ao salvar alterações, a revisão anterior será desfeita.</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" loading={busy} disabled={!!generating || !!uploading}>Salvar rascunho</Button><Button type="button" disabled={busy || !!generating || !!uploading} onClick={closeEditor}>Cancelar</Button></div>
      </form>
      {editing && <div className="mt-6 border-t border-surface-200 pt-4"><p className="mb-3 text-sm text-surface-600">{editing.approvedAt ? 'Esta versão está revisada. Salvar alterações cancela a revisão.' : 'Confira as legendas e imagens. Salve qualquer alteração antes de marcar esta versão como revisada.'}</p>{!editing.approvedAt && <Button type="button" disabled={busy || !!generating || !!uploading || title !== editing.title || platforms.some(({ value }) => captions[value] !== (editing.variants.find(v => v.platform === value)?.caption ?? '') || images[value] !== (editing.variants.find(v => v.platform === value)?.socialMediaId ?? null))} onClick={() => { setOpen(false); void approve(editing); }}>Marcar versão salva como revisada</Button>}</div>}
    </Modal>
    <ConfirmDialog
      open={!!pendingConfirmation}
      onOpenChange={value => { if (!value) setPendingConfirmation(null); }}
      title={pendingConfirmation?.kind === 'discard' ? 'Descartar alterações?' : pendingConfirmation?.kind === 'trip' ? 'Usar dados da viagem?' : 'Substituir legenda?'}
      description={pendingConfirmation?.kind === 'discard' ? 'As alterações que ainda não foram salvas serão perdidas.' : pendingConfirmation?.kind === 'trip' ? 'O título e a ideia serão substituídos. As legendas já escritas serão mantidas.' : 'A legenda atual será substituída pela sugestão de IA.'}
      confirmLabel={pendingConfirmation?.kind === 'discard' ? 'Descartar alterações' : pendingConfirmation?.kind === 'trip' ? 'Usar dados da viagem' : 'Gerar sugestão'}
      danger={pendingConfirmation?.kind === 'discard'}
      onConfirm={confirmAction}
    />
  </div>;
}
