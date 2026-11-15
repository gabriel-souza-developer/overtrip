import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Share2 } from 'lucide-react';
import { request } from '../api';
import { socialPostsApi, type SocialPlatform, type SocialPost } from '../api/socialPosts';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import Field from '../components/Field';
import Modal from '../components/Modal';
import ErrorState from '../components/ErrorState';
import SocialArtCreator from '../components/SocialArtCreator';

const platforms: { value: SocialPlatform; label: string }[] = [
  { value: 'INSTAGRAM', label: 'Instagram' }, { value: 'FACEBOOK', label: 'Facebook' }, { value: 'TIKTOK', label: 'TikTok' },
];
const blank = (): Record<SocialPlatform, string> => ({ INSTAGRAM: '', FACEBOOK: '', TIKTOK: '' });

export default function SocialPosts() {
  const [items, setItems] = useState<SocialPost[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<SocialPost | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [captions, setCaptions] = useState(blank);
  const [briefing, setBriefing] = useState('');
  const [generating, setGenerating] = useState<SocialPlatform | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<SocialPost | null>(null);

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
    setCaptions(next); setBriefing(''); setFormError(''); setOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const variants = platforms.map(({ value }) => ({ platform: value, caption: captions[value].trim() })).filter(v => v.caption);
    if (!title.trim() || !variants.length) { setFormError('Informe um título e pelo menos uma legenda.'); return; }
    setBusy(true); setFormError('');
    try {
      const input = { title: title.trim(), variants };
      if (editing) await socialPostsApi.update(editing.id, { ...input, version: editing.version });
      else await socialPostsApi.create(input);
      setOpen(false); await load();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Não foi possível salvar o rascunho.'); }
    finally { setBusy(false); }
  };
  const suggest = async (platform: SocialPlatform) => {
    if (!briefing.trim()) { setFormError('Descreva o post para receber uma sugestão.'); return; }
    if (captions[platform].trim() && !window.confirm('Substituir a legenda atual pela sugestão de IA?')) return;
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
  const approve = async (post: SocialPost) => {
    setBusy(true); setError('');
    try { await socialPostsApi.approve(post.id, post.version); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível aprovar.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!pendingRemoval) return;
    setBusy(true); setError('');
    try { await socialPostsApi.remove(pendingRemoval.id, pendingRemoval.version); setPendingRemoval(null); if (items.length === 1 && page > 1) setPage(page - 1); else await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível excluir.'); setPendingRemoval(null); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="Redes sociais" description="Prepare e revise suas legendas em um só lugar." actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => edit()}>Novo post</Button>} />
    <p className="rounded-xl bg-surface-100 p-4 text-sm text-surface-700">A aprovação registra sua revisão. A conexão com redes e a publicação ainda não estão disponíveis.</p>
    <details className="card p-5"><summary className="cursor-pointer font-semibold text-surface-900">Criar uma capa</summary><div className="mt-4"><SocialArtCreator /></div></details>
    {error && <ErrorState message={error} onRetry={load} />}
    {loading ? <p role="status">Carregando posts...</p> : !error && items.length === 0 ? <div className="card p-10 text-center text-surface-600"><Share2 className="w-8 h-8 mx-auto mb-3" aria-hidden="true" />Nenhum post criado ainda.</div> : <div className="grid gap-3">{items.map(post => <article key={post.id} className="card p-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h2 className="font-semibold text-surface-900 break-words">{post.title}</h2><p className="mt-1 text-sm text-surface-600">{post.approvedAt ? 'Revisado' : 'Aguardando revisão'} · {post.variants.map(v => platforms.find(p => p.value === v.platform)?.label ?? v.platform).join(', ')}</p></div>
      <div className="flex flex-wrap gap-2"><Button small onClick={() => edit(post)}>Abrir e revisar</Button><Button small variant="danger" disabled={busy} onClick={() => setPendingRemoval(post)}>Excluir</Button></div>
    </article>)}</div>}
    {pages > 1 && <div className="flex items-center gap-3"><Button small disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {page} de {pages}</span><Button small disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>}
    <Modal open={!!pendingRemoval} onOpenChange={value => { if (!value && !busy) setPendingRemoval(null); }} title="Excluir post" description="O rascunho e suas legendas serão excluídos." footer={<><Button disabled={busy} onClick={() => setPendingRemoval(null)}>Cancelar</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Excluir</Button></>}><p>Excluir {pendingRemoval?.title}?</p></Modal>
    <Modal open={open} onOpenChange={value => { if (!busy && !generating) setOpen(value); }} title={editing ? 'Revisar post' : 'Novo post'} description="Escreva as legendas para as redes que deseja usar." widthClass="max-w-2xl">
      <form className="space-y-5" onSubmit={save}>
        <Field id="social-title" label="Título interno" required><input id="social-title" className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required /></Field>
        <Field id="social-briefing" label="Ideia para a legenda" hint="Descreva a viagem, o público e o que deseja comunicar. Revise sugestões antes de salvar."><textarea id="social-briefing" className="input" rows={3} maxLength={3000} value={briefing} onChange={e => setBriefing(e.target.value)} /></Field>
        <p className="text-sm text-surface-600">Ao solicitar uma sugestão, sua descrição será enviada ao provedor de IA configurado. Não inclua dados pessoais de clientes.</p>
        {platforms.map(({ value, label }) => <Field key={value} id={`caption-${value}`} label={`Legenda para ${label}`}><textarea id={`caption-${value}`} className="input" rows={4} maxLength={5000} value={captions[value]} onChange={e => setCaptions(c => ({ ...c, [value]: e.target.value }))} /><div className="mt-2"><Button type="button" small disabled={busy || !!generating} onClick={() => void suggest(value)}>{generating === value ? 'Gerando...' : 'Sugerir legenda'}</Button></div></Field>)}
        {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
        {editing?.approvedAt && <p className="text-sm text-surface-600">Ao salvar alterações, a revisão anterior será desfeita.</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" loading={busy} disabled={!!generating}>Salvar rascunho</Button><Button type="button" disabled={busy || !!generating} onClick={() => setOpen(false)}>Cancelar</Button></div>
      </form>
      {editing && <div className="mt-6 border-t border-surface-200 pt-4"><p className="mb-3 text-sm text-surface-600">Salve suas alterações e confira as legendas antes de marcar como revisado.</p><Button type="button" disabled={busy || !!generating || title !== editing.title || platforms.some(({ value }) => captions[value] !== (editing.variants.find(v => v.platform === value)?.caption ?? ''))} onClick={() => { setOpen(false); void approve(editing); }}>Marcar versão salva como revisada</Button></div>}
    </Modal>
  </div>;
}
