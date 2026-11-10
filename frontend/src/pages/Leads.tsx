import React, { useCallback, useEffect, useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { leadsApi, Lead, LeadInput, LeadStage } from '../api/leads';
import { tripApi, Trip } from '../api';
import { useAuth } from '../App';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Field from '../components/Field';

const STAGES: Record<LeadStage, string> = { NEW: 'Novo', CONTACTED: 'Contato realizado', NEGOTIATING: 'Em negociação', WON: 'Convertido', LOST: 'Encerrado' };
const empty = (): LeadInput => ({ name: '', phone: '', email: '', stage: 'NEW', tripId: '', responsible: '', nextFollowUpAt: null, notes: '' });
const dateInput = (v: string | null) => v ? v.slice(0, 10) : '';
const dateLabel = (v: string) => new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

export default function Leads() {
  const { user } = useAuth();
  const [items, setItems] = useState<Lead[]>([]); const [trips, setTrips] = useState<Pick<Trip, 'id' | 'title'>[]>([]);
  const [tripLoading, setTripLoading] = useState(false); const [tripError, setTripError] = useState('');
  const [stage, setStage] = useState(''); const [page, setPage] = useState(1); const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [editing, setEditing] = useState<Lead | null>(null); const [open, setOpen] = useState(false); const [form, setForm] = useState<LeadInput>(empty());
  const [pendingRemoval, setPendingRemoval] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false); const [formError, setFormError] = useState(''); const [detail, setDetail] = useState<Lead | null>(null); const [eventBody, setEventBody] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await leadsApi.list(stage, page); setItems(data.data); setPages(Math.max(1, data.pagination.totalPages)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro ao carregar interessados.'); }
    finally { setLoading(false); }
  }, [stage, page]);
  const loadTrips = useCallback(async () => {
    setTripLoading(true); setTripError('');
    try {
      const first = await tripApi.list({ page: 1, limit: 100 });
      const all: Pick<Trip, 'id' | 'title'>[] = [...first.data];
      for (let current = 2; current <= first.pagination.totalPages; current += 1) {
        const next = await tripApi.list({ page: current, limit: 100 });
        all.push(...next.data);
      }
      setTrips(all);
    } catch (err) {
      setTripError(err instanceof Error ? `Não foi possível carregar todas as viagens: ${err.message}` : 'Não foi possível carregar todas as viagens.');
    } finally { setTripLoading(false); }
  }, []);
  useEffect(() => { if (user?.role === 'admin') load(); }, [load, user?.role]);
  useEffect(() => { if (user?.role === 'admin') void loadTrips(); }, [loadTrips, user?.role]);
  if (user?.role !== 'admin') return <p>Acesso disponível apenas para administradores.</p>;
  const edit = (lead?: Lead) => { setEditing(lead || null); setForm(lead ? { name: lead.name, phone: lead.phone, email: lead.email, stage: lead.stage, tripId: lead.tripId, responsible: lead.responsible, nextFollowUpAt: lead.nextFollowUpAt, notes: lead.notes } : empty()); setFormError(''); setOpen(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tripLoading || tripError) { setFormError('Aguarde o carregamento das viagens antes de salvar.'); return; }
    setBusy(true); setFormError('');
    try {
      const input = { ...form, name: form.name.trim(), email: form.email?.trim() || null, phone: form.phone?.trim() || null, responsible: form.responsible?.trim() || null, tripId: form.tripId || null, notes: form.notes?.trim() || null };
      if (editing) await leadsApi.update(editing.id, input); else await leadsApi.create(input);
      setOpen(false); await load();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Erro ao salvar.'); } finally { setBusy(false); }
  };
  const openDetail = async (id: string) => { setError(''); try { setDetail(await leadsApi.get(id)); setEventBody(''); } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao carregar histórico.'); } };
  const addEvent = async (e: React.FormEvent) => { e.preventDefault(); if (!detail || !eventBody.trim()) return; setBusy(true); setFormError(''); try { await leadsApi.addEvent(detail.id, eventBody); setDetail(await leadsApi.get(detail.id)); setEventBody(''); } catch (err) { setFormError(err instanceof Error ? err.message : 'Erro ao salvar contato.'); } finally { setBusy(false); } };
  const remove = async () => { if (!pendingRemoval || busy) return; setBusy(true); try { await leadsApi.remove(pendingRemoval.id); setPendingRemoval(null); if (items.length === 1 && page > 1) setPage(page - 1); else await load(); } catch (err) { setPendingRemoval(null); setError(err instanceof Error ? err.message : 'Erro ao excluir.'); } finally { setBusy(false); } };
  return <div className="space-y-6">
    <PageHeader title="Interessados" description="Organize contatos e acompanhe a próxima ação de cada viagem." actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => edit()}>Novo interessado</Button>} />
    <div className="card p-4 flex flex-wrap items-center gap-3"><label htmlFor="lead-stage" className="text-sm font-medium">Etapa</label><select id="lead-stage" className="input max-w-xs" value={stage} onChange={e => { setStage(e.target.value); setPage(1); }}><option value="">Todas as etapas</option>{Object.entries(STAGES).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></div>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {loading ? <p>Carregando interessados...</p> : items.length === 0 ? <div className="card p-10 text-center text-surface-600"><UsersRound className="w-8 h-8 mx-auto mb-3" />Nenhum interessado encontrado.</div> : <div className="grid gap-3">{items.map(item => <article key={item.id} className="card p-4 sm:p-5 flex flex-wrap gap-3 items-start justify-between"><div className="space-y-1 min-w-0"><h2 className="font-semibold text-surface-900 break-words">{item.name}</h2><p className="text-sm text-surface-600">{STAGES[item.stage]} · {item.trip?.title || 'Sem viagem associada'}</p><p className="text-sm text-surface-600">{item.responsible ? `Responsável: ${item.responsible}` : 'Responsável não informado'}{item.nextFollowUpAt ? ` · Retorno: ${dateLabel(item.nextFollowUpAt)}` : ''}</p></div><div className="flex flex-wrap gap-2"><Button small onClick={() => openDetail(item.id)}>Histórico</Button><Button small onClick={() => edit(item)}>Editar</Button><Button small variant="danger" onClick={() => setPendingRemoval(item)}>Excluir</Button></div></article>)}</div>}
    {pages > 1 && <div className="flex items-center gap-3"><Button small disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-sm">Página {page} de {pages}</span><Button small disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button></div>}
    <Modal open={!!pendingRemoval} onOpenChange={v => { if (!v && !busy) setPendingRemoval(null); }} title="Excluir interessado" description="Esta ação também exclui todo o histórico de contatos." footer={<><Button disabled={busy} onClick={() => setPendingRemoval(null)}>Cancelar</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Excluir</Button></>}>
      <p>Excluir {pendingRemoval?.name}?</p>
    </Modal>
    <Modal open={open} onOpenChange={v => { if (!busy) setOpen(v); }} title={editing ? 'Editar interessado' : 'Novo interessado'} description="Os dados são visíveis apenas para administradores." footer={<><Button onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button><Button variant="primary" type="submit" form="lead-form" loading={busy} disabled={tripLoading || !!tripError}>Salvar</Button></>}>
      <form id="lead-form" onSubmit={save} className="space-y-4">{formError && <p role="alert" className="text-red-700 text-sm">{formError}</p>}
        <Field id="lead-name" label="Nome" required><input id="lead-name" className="input" required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field id="lead-phone" label="Telefone"><input id="lead-phone" className="input" type="tel" maxLength={40} value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field id="lead-email" label="E-mail"><input id="lead-email" className="input" type="email" maxLength={254} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <Field id="lead-trip" label="Viagem"><select id="lead-trip" className="input" value={form.tripId || ''} disabled={tripLoading || !!tripError} onChange={e => setForm({ ...form, tripId: e.target.value })}><option value="">{tripLoading ? 'Carregando viagens...' : 'Sem viagem associada'}</option>{trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
        {tripError && <div role="alert" className="text-sm text-red-700"><p>{tripError}</p><Button small onClick={() => void loadTrips()}>Tentar carregar viagens novamente</Button></div>}
        <Field id="lead-stage-form" label="Etapa"><select id="lead-stage-form" className="input" value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value as LeadStage })}>{Object.entries(STAGES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field id="lead-responsible" label="Responsável"><input id="lead-responsible" className="input" maxLength={120} value={form.responsible || ''} onChange={e => setForm({ ...form, responsible: e.target.value })} /></Field>
        <Field id="lead-next" label="Próximo contato"><input id="lead-next" className="input" type="date" value={dateInput(form.nextFollowUpAt)} onChange={e => setForm({ ...form, nextFollowUpAt: e.target.value ? `${e.target.value}T12:00:00.000Z` : null })} /></Field>
        <Field id="lead-notes" label="Observações"><textarea id="lead-notes" className="input" maxLength={3000} rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
      </form>
    </Modal>
    <Modal open={!!detail} onOpenChange={v => { if (!v && !busy) { setDetail(null); setFormError(''); } }} title={`Histórico · ${detail?.name || ''}`} description="Anotações manuais de atendimento.">
      <div className="space-y-4"><p className="text-sm text-surface-600">{detail?.phone || 'Telefone não informado'} {detail?.email ? `· ${detail.email}` : ''}</p>
      {detail?.events?.length ? <ul className="space-y-3">{detail.events.map(ev => <li className="rounded-lg bg-surface-50 p-3" key={ev.id}><time className="text-xs text-surface-500">{new Date(ev.createdAt).toLocaleString('pt-BR')}</time><p className="text-sm whitespace-pre-wrap mt-1 break-words">{ev.body}</p></li>)}</ul> : <p className="text-sm text-surface-600">Nenhum contato registrado.</p>}
      <form onSubmit={addEvent} className="space-y-3">{formError && <p role="alert" className="text-red-700 text-sm">{formError}</p>}<Field id="lead-event" label="Registrar contato"><textarea id="lead-event" className="input" rows={3} maxLength={2000} required value={eventBody} onChange={e => setEventBody(e.target.value)} /></Field><Button type="submit" variant="primary" loading={busy}>Adicionar ao histórico</Button></form></div>
    </Modal>
  </div>;
}
