import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { leadsApi, Lead, LeadInput, LeadStage } from '../api/leads';
import { tripApi, Trip } from '../api';
import { useAuth } from '../App';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Field from '../components/Field';
import { followUpDateKey, followUpDateLabel } from '../lib/leadFollowUp';

const STAGES: Record<LeadStage, string> = { NEW: 'Novo', CONTACTED: 'Contato realizado', NEGOTIATING: 'Em negociação', WON: 'Convertido', LOST: 'Encerrado' };
const empty = (): LeadInput => ({ name: '', phone: '', email: '', stage: 'NEW', tripId: '', responsible: '', nextFollowUpAt: null, notes: '' });
const dateInput = (v: string | null) => followUpDateKey(v);


export default function Leads() {
  const { user } = useAuth();
  const [items, setItems] = useState<Lead[]>([]); const [trips, setTrips] = useState<Pick<Trip, 'id' | 'title'>[]>([]);
  const [tripLoading, setTripLoading] = useState(false); const [tripError, setTripError] = useState('');
  const [tripSearch, setTripSearch] = useState(''); const [tripPage, setTripPage] = useState(0); const [tripPages, setTripPages] = useState(0);
  const [selectedTrip, setSelectedTrip] = useState<Pick<Trip, 'id' | 'title'> | null>(null);
  const tripRequest = useRef(0); const listRequest = useRef(0);
  const [stage, setStage] = useState(''); const [followUp, setFollowUp] = useState(''); const [page, setPage] = useState(1); const [pages, setPages] = useState(1);
  const [search, setSearch] = useState(''); const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [listError, setListError] = useState('');
  const [editing, setEditing] = useState<Lead | null>(null); const [open, setOpen] = useState(false); const [form, setForm] = useState<LeadInput>(empty());
  const [pendingRemoval, setPendingRemoval] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false); const [formError, setFormError] = useState(''); const [detail, setDetail] = useState<Lead | null>(null); const [eventBody, setEventBody] = useState('');
  const load = useCallback(async () => {
    const requestId = ++listRequest.current;
    setLoading(true); setListError('');
    try { const data = await leadsApi.list(stage, page, 20, followUp, appliedSearch); if (requestId === listRequest.current) { setItems(data.data); setPages(Math.max(1, data.pagination.totalPages)); } }
    catch (err) { if (requestId === listRequest.current) setListError(err instanceof Error ? err.message : 'Erro ao carregar interessados.'); }
    finally { if (requestId === listRequest.current) setLoading(false); }
  }, [stage, followUp, page, appliedSearch]);
  const currentLoad = useRef(load); currentLoad.current = load;
  const loadTrips = useCallback(async (nextPage: number, requestId: number) => {
    setTripLoading(true); setTripError('');
    try {
      const result = await tripApi.list({ page: nextPage, limit: 20, search: tripSearch.trim() });
      if (requestId !== tripRequest.current) return;
      setTrips(previous => nextPage === 1 ? result.data : [...previous, ...result.data.filter(item => !previous.some(existing => existing.id === item.id))]);
      setTripPage(nextPage); setTripPages(result.pagination.totalPages);
    } catch (err) {
      if (requestId === tripRequest.current) setTripError(err instanceof Error ? `Não foi possível carregar viagens: ${err.message}` : 'Não foi possível carregar viagens.');
    } finally { if (requestId === tripRequest.current) setTripLoading(false); }
  }, [tripSearch]);
  useEffect(() => { if (user?.role === 'admin') void load(); return () => { listRequest.current += 1; }; }, [load, user?.role]);
  useEffect(() => {
    if (search.trim() === appliedSearch) return;
    const timer = window.setTimeout(() => { setPage(1); setAppliedSearch(search.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [search, appliedSearch]);
  useEffect(() => {
    const id = ++tripRequest.current;
    setTrips([]); setTripPage(0); setTripPages(0); setTripError(''); setTripLoading(open && user?.role === 'admin');
    const timer = open && user?.role === 'admin' ? window.setTimeout(() => { void loadTrips(1, id); }, 250) : undefined;
    return () => { if (timer !== undefined) window.clearTimeout(timer); tripRequest.current += 1; };
  }, [open, loadTrips, user?.role]);
  if (user?.role !== 'admin') return <p>Acesso disponível apenas para administradores.</p>;
  const edit = (lead?: Lead) => { setEditing(lead || null); setForm(lead ? { name: lead.name, phone: lead.phone, email: lead.email, stage: lead.stage, tripId: lead.tripId, responsible: lead.responsible, nextFollowUpAt: lead.nextFollowUpAt, notes: lead.notes } : empty()); setSelectedTrip(lead?.tripId ? (lead.trip || { id: lead.tripId, title: 'Viagem vinculada' }) : null); setTripSearch(''); setFormError(''); setOpen(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setFormError('');
    try {
      const input = { ...form, name: form.name.trim(), email: form.email?.trim() || null, phone: form.phone?.trim() || null, responsible: form.responsible?.trim() || null, tripId: form.tripId || null, notes: form.notes?.trim() || null };
      if (editing) await leadsApi.update(editing.id, input); else await leadsApi.create(input);
      setOpen(false); await currentLoad.current();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Erro ao salvar.'); } finally { setBusy(false); }
  };
  const openDetail = async (id: string) => { setError(''); try { setDetail(await leadsApi.get(id)); setEventBody(''); } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao carregar histórico.'); } };
  const addEvent = async (e: React.FormEvent) => { e.preventDefault(); if (!detail || !eventBody.trim()) return; setBusy(true); setFormError(''); try { await leadsApi.addEvent(detail.id, eventBody); setDetail(await leadsApi.get(detail.id)); setEventBody(''); } catch (err) { setFormError(err instanceof Error ? err.message : 'Erro ao salvar contato.'); } finally { setBusy(false); } };
  const remove = async () => { if (!pendingRemoval || busy) return; setBusy(true); try { await leadsApi.remove(pendingRemoval.id); setPendingRemoval(null); if (items.length === 1 && page > 1) setPage(page - 1); else await currentLoad.current(); } catch (err) { setPendingRemoval(null); setError(err instanceof Error ? err.message : 'Erro ao excluir.'); } finally { setBusy(false); } };
  const tripOptions = selectedTrip && !trips.some(trip => trip.id === selectedTrip.id) ? [selectedTrip, ...trips] : trips;
  return <div className="space-y-6">
    <PageHeader title="Interessados" description="Organize contatos e acompanhe a próxima ação de cada viagem." actions={<Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => edit()}>Novo interessado</Button>} />
    <div className="card p-4 flex flex-wrap items-center gap-3"><label htmlFor="lead-search" className="text-sm font-medium">Buscar interessado</label><input id="lead-search" className="input max-w-xs" type="search" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, telefone ou e-mail" /><label htmlFor="lead-stage" className="text-sm font-medium">Etapa</label><select id="lead-stage" className="input max-w-xs" value={stage} onChange={e => { setStage(e.target.value); setPage(1); }}><option value="">Todas as etapas</option>{Object.entries(STAGES).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select><label htmlFor="lead-follow-up" className="text-sm font-medium">Próximo contato</label><select id="lead-follow-up" className="input max-w-xs" value={followUp} onChange={e => { setFollowUp(e.target.value); setPage(1); }}><option value="">Todos os contatos</option><option value="due">Vencidos e para hoje</option></select></div>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    {listError && search.trim() === appliedSearch && <div role="alert" className="text-red-700 text-sm"><p>{listError}</p><Button small onClick={() => void load()}>Tentar carregar interessados novamente</Button></div>}
    {loading || search.trim() !== appliedSearch ? <p>Carregando interessados...</p> : listError ? null : items.length === 0 ? <div className="card p-10 text-center text-surface-600"><UsersRound className="w-8 h-8 mx-auto mb-3" />{followUp ? 'Nenhum retorno vencido ou previsto para hoje.' : 'Nenhum interessado encontrado.'}</div> : <div className="grid gap-3">{items.map(item => { const followUpKey = followUpDateKey(item.nextFollowUpAt); const todayKey = followUpDateKey(new Date()); const overdue = !!followUpKey && followUpKey < todayKey; const dueToday = !!followUpKey && followUpKey === todayKey; return <article key={item.id} className="card p-4 sm:p-5 flex flex-wrap gap-3 items-start justify-between"><div className="space-y-1 min-w-0"><h2 className="font-semibold text-surface-900 break-words">{item.name}</h2><p className="text-sm text-surface-600">{STAGES[item.stage]} · {item.trip?.title || 'Sem viagem associada'}</p><p className="text-sm text-surface-600">{item.responsible ? `Responsável: ${item.responsible}` : 'Responsável não informado'}{item.nextFollowUpAt ? ` · Retorno: ${followUpDateLabel(item.nextFollowUpAt)}` : ''}</p>{overdue && <p className="text-sm font-medium text-red-700">Retorno vencido</p>}{dueToday && <p className="text-sm font-medium text-yellow-700">Retorno previsto para hoje</p>}</div><div className="flex flex-wrap gap-2"><Button small onClick={() => openDetail(item.id)}>Histórico</Button><Button small onClick={() => edit(item)}>Editar</Button><Button small variant="danger" onClick={() => setPendingRemoval(item)}>Excluir</Button></div></article>; })}</div>}
    {!loading && search.trim() === appliedSearch && !listError && pages > 1 && <div className="flex items-center gap-3"><Button small disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-sm">Página {page} de {pages}</span><Button small disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button></div>}
    <Modal open={!!pendingRemoval} onOpenChange={v => { if (!v && !busy) setPendingRemoval(null); }} title="Excluir interessado" description="Esta ação também exclui todo o histórico de contatos." footer={<><Button disabled={busy} onClick={() => setPendingRemoval(null)}>Cancelar</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Excluir</Button></>}>
      <p>Excluir {pendingRemoval?.name}?</p>
    </Modal>
    <Modal open={open} onOpenChange={v => { if (!busy) setOpen(v); }} title={editing ? 'Editar interessado' : 'Novo interessado'} description="Os dados são visíveis apenas para administradores." footer={<><Button onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button><Button variant="primary" type="submit" form="lead-form" loading={busy}>Salvar</Button></>}>
      <form id="lead-form" onSubmit={save} className="space-y-4">{formError && <p role="alert" className="text-red-700 text-sm">{formError}</p>}
        <Field id="lead-name" label="Nome" required><input id="lead-name" className="input" required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field id="lead-phone" label="Telefone"><input id="lead-phone" className="input" type="tel" maxLength={40} value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field id="lead-email" label="E-mail"><input id="lead-email" className="input" type="email" maxLength={254} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <Field id="lead-trip-search" label="Buscar viagem"><input id="lead-trip-search" className="input" value={tripSearch} onChange={e => setTripSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} /></Field>
        <Field id="lead-trip" label="Viagem"><select id="lead-trip" className="input" value={form.tripId || ''} onChange={e => { const value = e.target.value; setSelectedTrip(tripOptions.find(t => t.id === value) || null); setForm({ ...form, tripId: value }); }}><option value="">Sem viagem associada</option>{tripOptions.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
        {tripLoading && <p role="status" className="text-sm text-surface-600">Buscando viagens...</p>}
        {tripError && <div role="alert" className="text-sm text-red-700"><p>{tripError}</p><Button small onClick={() => void loadTrips(tripPage + 1, tripRequest.current)}>Tentar carregar viagens novamente</Button></div>}
        {!tripError && tripPage < tripPages && <Button small disabled={tripLoading} onClick={() => void loadTrips(tripPage + 1, tripRequest.current)}>Carregar mais viagens</Button>}
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
