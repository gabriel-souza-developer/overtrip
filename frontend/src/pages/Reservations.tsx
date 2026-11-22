import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, Plus } from 'lucide-react';
import { request, tripApi, type Pagination as PaginationInfo } from '../api';
import { useAuth } from '../App';
import { useToast } from '../hooks/useToast';
import { reservationMoneyToCents } from '../lib/reservationMoney';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Field from '../components/Field';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
interface Installment { id: string; amountCents: number; dueDate: string | null; paidAt: string | null }
interface Reservation {
  id: string; tripId: string; leadId: string | null; customerName: string; customerPhone: string | null;
  seats: number; totalCents: number; notes: string | null; status: ReservationStatus;
  trip: { id: string; title: string; startDateISO: string }; lead?: { id: string; name: string } | null; installments: Installment[];
}
const labels: Record<ReservationStatus, string> = { PENDING: 'Pendente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada' };
const formatMoney = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function reservationRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  return request<T>(`/reservations${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

type FormState = { tripId: string; leadId: string; customerName: string; customerPhone: string; seats: string; total: string; notes: string };
const emptyForm: FormState = { tripId: '', leadId: '', customerName: '', customerPhone: '', seats: '1', total: '', notes: '' };
type Option = { id: string; label: string };
type OptionPage = { data: Option[]; totalPages: number };

// A generation guards against late responses after search, selection or unmount.
function useOptionSearch(enabled: boolean, search: string, scope: string, fetchPage: (search: string, scope: string, page: number) => Promise<OptionPage>) {
  const [items, setItems] = useState<Option[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const fetchNext = useCallback(async (nextPage: number, id: number) => {
    setLoading(true); setError(false);
    try {
      const result = await fetchPage(search.trim(), scope, nextPage);
      if (id !== generation.current) return;
      setItems(previous => nextPage === 1 ? result.data : [...previous, ...result.data.filter(item => !previous.some(old => old.id === item.id))]);
      setPage(nextPage); setTotalPages(result.totalPages);
    } catch {
      if (id === generation.current) setError(true);
    } finally { if (id === generation.current) setLoading(false); }
  }, [fetchPage, search, scope]);
  useEffect(() => {
    const id = ++generation.current;
    setItems([]); setPage(0); setTotalPages(0); setError(false); setLoading(enabled);
    const timer = enabled ? window.setTimeout(() => { void fetchNext(1, id); }, 250) : undefined;
    return () => { if (timer !== undefined) window.clearTimeout(timer); generation.current += 1; };
  }, [enabled, fetchNext]);
  return { items, loading, error, hasMore: page < totalPages, next: () => { if (!loading) void fetchNext(page + 1, generation.current); } };
}

const fetchTrips = async (search: string, _scope: string, page: number): Promise<OptionPage> => {
  const result = await tripApi.list({ search, page, limit: 20 });
  return { data: result.data.map(trip => ({ id: trip.id, label: trip.title })), totalPages: result.pagination.totalPages };
};
const fetchLeads = async (search: string, tripId: string, page: number): Promise<OptionPage> => {
  const query = new URLSearchParams({ page: String(page), limit: '20', eligibleTripId: tripId });
  if (search) query.set('search', search);
  const result = await request<{ data: { id: string; name: string; tripId: string | null }[]; pagination: { totalPages: number } }>(`/leads?${query}`);
  return { data: result.data.filter(lead => !lead.tripId || lead.tripId === tripId).map(lead => ({ id: lead.id, label: lead.name })), totalPages: result.pagination.totalPages };
};
const withSelected = (items: Option[], ...selected: (Option | null)[]) => {
  const result = [...items];
  selected.forEach(item => { if (item && !result.some(current => current.id === item.id)) result.unshift(item); });
  return result;
};

export default function Reservations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const listRequest = useRef(0);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ reservationId: string; installmentId: string } | null>(null);
  const [tripFilter, setTripFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [installmentFor, setInstallmentFor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [installmentError, setInstallmentError] = useState('');
  const [tripSearch, setTripSearch] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedFilterTrip, setSelectedFilterTrip] = useState<Option | null>(null);
  const [selectedFormTrip, setSelectedFormTrip] = useState<Option | null>(null);
  const [selectedLead, setSelectedLead] = useState<Option | null>(null);
  const trips = useOptionSearch(isAdmin, tripSearch, '', fetchTrips);
  const leads = useOptionSearch(isAdmin && showForm && !!form.tripId, leadSearch, form.tripId, fetchLeads);
  const tripOptions = withSelected(trips.items, selectedFilterTrip, selectedFormTrip);
  const leadOptions = withSelected(leads.items, selectedLead);


  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    const requestId = ++listRequest.current;
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (tripFilter) query.set('tripId', tripFilter);
      if (statusFilter) query.set('status', statusFilter);
      query.set('page', String(page));
      query.set('limit', '20');
      const reservations = await reservationRequest<{ data: Reservation[]; pagination: PaginationInfo }>(`?${query}`);
      if (requestId !== listRequest.current) return;
      setRows(reservations.data); setPagination(reservations.pagination);
    } catch (e) {
      if (requestId === listRequest.current) setError(e instanceof Error ? e.message : 'Não foi possível carregar as reservas.');
    } finally { if (requestId === listRequest.current) setLoading(false); }
  }, [isAdmin, tripFilter, statusFilter, page]);
  const currentLoad = useRef(load);
  currentLoad.current = load;
  useEffect(() => { void load(); return () => { listRequest.current += 1; }; }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('');
    const cents = reservationMoneyToCents(form.total);
    const seats = Number(form.seats);
    if (!form.tripId || !form.customerName.trim() || !Number.isInteger(seats) || seats < 1 || seats > 100 || cents === null || cents > 100_000_000) {
      setFormError('Informe viagem, nome, de 1 a 100 lugares e um valor total de até R$ 1.000.000,00.'); return;
    }
    setSaving(true);
    try {
      const fields = { customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim() || null, seats, totalCents: cents, notes: form.notes.trim() || null, leadId: form.leadId || null };
      if (editingId) await reservationRequest(`/${encodeURIComponent(editingId)}`, 'PATCH', fields);
      else await reservationRequest('', 'POST', { tripId: form.tripId, ...fields });
      setForm(emptyForm); setEditingId(null); setShowForm(false); toast.success(editingId ? 'Reserva atualizada.' : 'Reserva cadastrada como pendente.'); await currentLoad.current();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Não foi possível cadastrar a reserva.'); }
    finally { setSaving(false); }
  };
  const changeStatus = async (id: string, status: ReservationStatus) => {
    setBusyId(id);
    try { await reservationRequest(`/${encodeURIComponent(id)}`, 'PATCH', { status }); toast.success('Situação atualizada.'); await currentLoad.current(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar a situação.'); }
    finally { setBusyId(null); }
  };
  const addInstallment = async (e: React.FormEvent, id: string) => {
    e.preventDefault(); setInstallmentError('');
    const cents = reservationMoneyToCents(amount);
    if (cents === null || cents <= 0 || cents > 100_000_000) { setInstallmentError('Informe um valor maior que zero e de até R$ 1.000.000,00.'); return; }
    setBusyId(id);
    try {
      await reservationRequest(`/${encodeURIComponent(id)}/installments`, 'POST', { amountCents: cents, dueDate: dueDate || null });
      setInstallmentFor(null); setAmount(''); setDueDate(''); toast.success('Parcela registrada.'); await currentLoad.current();
    } catch (e) { setInstallmentError(e instanceof Error ? e.message : 'Não foi possível registrar a parcela.'); }
    finally { setBusyId(null); }
  };
  const setPaid = async (reservationId: string, installmentId: string, paid: boolean) => {
    setBusyId(reservationId);
    try { await reservationRequest(`/${encodeURIComponent(reservationId)}/installments/${encodeURIComponent(installmentId)}`, 'PATCH', { paid }); toast.success(paid ? 'Recebimento registrado.' : 'Parcela marcada como pendente.'); await currentLoad.current(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar a parcela.'); }
    finally { setBusyId(null); }
  };
  const deleteInstallment = async (reservationId: string, installmentId: string) => {
    setBusyId(reservationId);
    try { await reservationRequest(`/${encodeURIComponent(reservationId)}/installments/${encodeURIComponent(installmentId)}`, 'DELETE'); setPendingRemoval(null); toast.success('Parcela excluída.'); await currentLoad.current(); }
    catch (e) { setPendingRemoval(null); toast.error(e instanceof Error ? e.message : 'Não foi possível excluir a parcela.'); }
    finally { setBusyId(null); }
  };

  if (!isAdmin) return <div className="space-y-6"><PageHeader title="Reservas" /><ErrorState message="Somente administradores podem acessar as reservas." /></div>;
  return <div className="space-y-6">
    <PageHeader title="Reservas" description="Organize solicitações e registre parcelas manualmente." actions={<Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={() => { setFormError(''); setEditingId(null); setForm(emptyForm); setSelectedFormTrip(null); setSelectedLead(null); setLeadSearch(''); setShowForm(!showForm); }}>{showForm ? 'Fechar cadastro' : 'Nova reserva'}</Button>} />
    <p className="text-sm text-surface-600">O registro é interno. Ele não confirma vagas automaticamente e não processa pagamentos.</p>
    {showForm && <form className="card p-5 sm:p-6 space-y-4" onSubmit={create} noValidate>
      <h2 className="text-lg font-semibold">{editingId ? 'Editar reserva' : 'Nova reserva'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2"><Field id="res-trip" label="Viagem" required><select id="res-trip" className="input" value={form.tripId} onChange={e => { setSelectedFormTrip(tripOptions.find(t => t.id === e.target.value) || null); setSelectedLead(null); setLeadSearch(''); setForm({ ...form, tripId: e.target.value, leadId: '' }); }} disabled={!!editingId} required><option value="">Selecione</option>{tripOptions.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field><Field id="res-trip-search" label="Buscar viagem"><input id="res-trip-search" className="input" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} value={tripSearch} onChange={e => setTripSearch(e.target.value)} /></Field>{trips.loading && <p role="status">Buscando viagens...</p>}{trips.error && <Button type="button" small onClick={trips.next}>Tentar novamente viagens</Button>}{trips.hasMore && !trips.error && <Button type="button" small disabled={trips.loading} onClick={trips.next}>Carregar mais viagens</Button>}</div>
        <div className="space-y-2"><Field id="res-lead" label="Interessado vinculado" hint="Opcional: conecta esta reserva ao acompanhamento do interessado."><select id="res-lead" className="input" value={form.leadId} disabled={!form.tripId} onChange={e => { setSelectedLead(leadOptions.find(lead => lead.id === e.target.value) || null); setForm({ ...form, leadId: e.target.value }); }}><option value="">Sem interessado vinculado</option>{leadOptions.map(lead => <option key={lead.id} value={lead.id}>{lead.label}</option>)}</select></Field><Field id="res-lead-search" label="Buscar interessado"><input id="res-lead-search" className="input" placeholder="Nome, telefone ou e-mail" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} maxLength={120} disabled={!form.tripId} value={leadSearch} onChange={e => setLeadSearch(e.target.value)} /></Field>{leads.loading && <p role="status">Buscando interessados...</p>}{leads.error && <Button type="button" small onClick={leads.next}>Tentar novamente interessados</Button>}{leads.hasMore && !leads.error && <Button type="button" small disabled={leads.loading} onClick={leads.next}>Carregar mais interessados</Button>}</div>
        <Field id="res-name" label="Nome do responsável" required><input id="res-name" className="input" value={form.customerName} maxLength={150} onChange={e => setForm({ ...form, customerName: e.target.value })} required /></Field>
        <Field id="res-phone" label="Telefone"><input id="res-phone" className="input" type="tel" autoComplete="tel" maxLength={40} value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} /></Field>
        <Field id="res-seats" label="Quantidade de lugares" required><input id="res-seats" className="input" type="number" min="1" max="100" step="1" value={form.seats} onChange={e => setForm({ ...form, seats: e.target.value })} required /></Field>
        <Field id="res-total" label="Valor total (R$)" required hint="Exemplo: 250,00"><input id="res-total" className="input" inputMode="decimal" placeholder="0,00" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} aria-describedby="res-total-hint" required /></Field>
        <Field id="res-notes" label="Observações"><textarea id="res-notes" className="input" maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <Button type="submit" variant="primary" loading={saving} loadingText="Salvando...">{editingId ? 'Salvar alterações' : 'Cadastrar reserva'}</Button>
    </form>}
    <div className="card p-4 flex flex-wrap items-end gap-4">
      <Field id="res-filter-search" label="Buscar viagem para filtrar"><input id="res-filter-search" className="input" value={tripSearch} onChange={e => setTripSearch(e.target.value)} /></Field>
      <Field id="res-filter-trip" label="Filtrar viagem"><select id="res-filter-trip" className="input" value={tripFilter} onChange={e => { setSelectedFilterTrip(tripOptions.find(t => t.id === e.target.value) || null); setPage(1); setTripFilter(e.target.value); }}><option value="">Todas as viagens</option>{tripOptions.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
      {trips.loading && <p role="status">Buscando viagens...</p>}{trips.error && <Button small onClick={trips.next}>Tentar novamente viagens</Button>}{trips.hasMore && !trips.error && <Button small disabled={trips.loading} onClick={trips.next}>Carregar mais viagens</Button>}
      <Field id="res-filter-status" label="Situação"><select id="res-filter-status" className="input" value={statusFilter} onChange={e => { setPage(1); setStatusFilter(e.target.value); }}><option value="">Todas</option>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
    </div>
    {error && <ErrorState message={error} onRetry={() => void load()} />}
    {loading ? <p role="status" className="text-sm text-surface-600">Carregando reservas...</p> : error ? null : rows.length === 0 ? <EmptyState icon={<CalendarCheck />} title="Nenhuma reserva encontrada" text="Cadastre uma reserva ou ajuste os filtros." /> : <div className="space-y-4">{rows.map(row => <article className="card p-5 space-y-4" key={row.id}>
      <div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold text-surface-900">{row.customerName}</h2><p className="text-sm text-surface-600">{row.trip.title} · {row.seats} {row.seats === 1 ? 'lugar' : 'lugares'} · {formatMoney(row.totalCents)}</p>{row.leadId && <p className="text-sm text-surface-600">Interessado: {row.lead?.name || 'vinculado'}</p>}{row.customerPhone && <p className="text-sm text-surface-600">{row.customerPhone}</p>}{row.notes && <p className="text-sm text-surface-600 mt-1 whitespace-pre-wrap">{row.notes}</p>}<Button small className="mt-3" disabled={saving} onClick={() => { setEditingId(row.id); setForm({ tripId: row.tripId, leadId: row.leadId || '', customerName: row.customerName, customerPhone: row.customerPhone || '', seats: String(row.seats), total: (row.totalCents / 100).toFixed(2).replace('.', ','), notes: row.notes || '' }); setFormError(''); setSelectedFormTrip({ id: row.trip.id, label: row.trip.title }); setSelectedLead(row.leadId ? { id: row.leadId, label: row.lead?.name || 'Interessado vinculado' } : null); setLeadSearch(''); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar dados</Button></div><div><label className="label" htmlFor={`status-${row.id}`}>Situação</label><select id={`status-${row.id}`} className="input" value={row.status} disabled={busyId === row.id} onChange={e => void changeStatus(row.id, e.target.value as ReservationStatus)}>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div></div>
      <div className="border-t border-surface-200 pt-4"><div className="flex flex-wrap justify-between items-center gap-2"><h3 className="font-semibold text-sm">Parcelas</h3><Button small onClick={() => { setInstallmentFor(installmentFor === row.id ? null : row.id); setAmount(''); setDueDate(''); setInstallmentError(''); }} disabled={busyId === row.id || row.status === 'CANCELLED'}>{installmentFor === row.id ? 'Fechar' : 'Adicionar parcela'}</Button></div>
        {row.installments.length === 0 ? <p className="text-sm text-surface-600 mt-2">Nenhuma parcela registrada.</p> : <ul className="space-y-2 mt-3">{row.installments.map(item => <li className="flex flex-wrap items-center justify-between gap-2 text-sm" key={item.id}><span>{formatMoney(item.amountCents)} · {item.dueDate ? `Vencimento: ${item.dueDate.slice(0, 10).split('-').reverse().join('/')}` : 'Sem vencimento'} · {item.paidAt ? 'Recebida' : 'Pendente'}</span><span className="flex gap-2"><Button small disabled={busyId === row.id || row.status === 'CANCELLED'} onClick={() => void setPaid(row.id, item.id, !item.paidAt)}>{item.paidAt ? 'Marcar pendente' : 'Registrar recebimento'}</Button>{!item.paidAt && <Button small variant="ghost" disabled={busyId === row.id || row.status === 'CANCELLED'} onClick={() => setPendingRemoval({ reservationId: row.id, installmentId: item.id })}>Excluir</Button>}</span></li>)}</ul>}
        {installmentFor === row.id && row.status !== 'CANCELLED' && <form className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4" onSubmit={e => void addInstallment(e, row.id)} noValidate><Field id={`amount-${row.id}`} label="Valor da parcela (R$)" required><input id={`amount-${row.id}`} className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} /></Field><Field id={`due-${row.id}`} label="Vencimento"><input id={`due-${row.id}`} className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field><div className="self-end"><Button type="submit" variant="primary" loading={busyId === row.id}>Salvar parcela</Button></div>{installmentError && <p role="alert" className="text-sm text-red-700 sm:col-span-3">{installmentError}</p>}</form>}
      </div>
    </article>)}</div>}
    <Modal open={!!pendingRemoval} onOpenChange={v => { if (!v && !busyId) setPendingRemoval(null); }} title="Excluir parcela" description="Esta ação remove a parcela pendente." footer={<><Button disabled={!!busyId} onClick={() => setPendingRemoval(null)}>Cancelar</Button><Button variant="danger" loading={!!busyId} onClick={() => { if (pendingRemoval && !busyId) void deleteInstallment(pendingRemoval.reservationId, pendingRemoval.installmentId); }}>Excluir</Button></>}>
      <p>Excluir esta parcela pendente?</p>
    </Modal>
    {!loading && !error && <Pagination pagination={pagination} onChange={setPage} />}
  </div>;
}
