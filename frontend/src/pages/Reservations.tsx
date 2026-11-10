import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Plus } from 'lucide-react';
import { tripApi, type Trip, type Pagination as PaginationInfo } from '../api';
import { useAuth } from '../App';
import { useToast } from '../hooks/useToast';
import { translateApiError } from '../lib/formHelpers';
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
  id: string; tripId: string; customerName: string; customerPhone: string | null;
  seats: number; totalCents: number; notes: string | null; status: ReservationStatus;
  trip: { id: string; title: string; startDateISO: string }; installments: Installment[];
}
const labels: Record<ReservationStatus, string> = { PENDING: 'Pendente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada' };
const formatMoney = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function reservationRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(`/api/reservations${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(translateApiError(data));
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

type FormState = { tripId: string; customerName: string; customerPhone: string; seats: string; total: string; notes: string };
const emptyForm: FormState = { tripId: '', customerName: '', customerPhone: '', seats: '1', total: '', notes: '' };
async function loadTrips(): Promise<Trip[]> {
  const first = await tripApi.list({ limit: 100, page: 1 });
  const result = [...first.data];
  for (let page = 2; page <= first.pagination.totalPages; page += 1) {
    const next = await tripApi.list({ limit: 100, page });
    result.push(...next.data);
  }
  return result;
}

export default function Reservations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [rows, setRows] = useState<Reservation[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (tripFilter) query.set('tripId', tripFilter);
      if (statusFilter) query.set('status', statusFilter);
      query.set('page', String(page));
      query.set('limit', '20');
      const [reservations, tripData] = await Promise.all([
        reservationRequest<{ data: Reservation[]; pagination: PaginationInfo }>(`?${query}`),
        loadTrips(),
      ]);
      setRows(reservations.data); setPagination(reservations.pagination); setTrips(tripData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as reservas.');
    } finally { setLoading(false); }
  }, [isAdmin, tripFilter, statusFilter, page]);
  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('');
    const cents = reservationMoneyToCents(form.total);
    const seats = Number(form.seats);
    if (!form.tripId || !form.customerName.trim() || !Number.isInteger(seats) || seats < 1 || seats > 100 || cents === null || cents > 100_000_000) {
      setFormError('Informe viagem, nome, de 1 a 100 lugares e um valor total de até R$ 1.000.000,00.'); return;
    }
    setSaving(true);
    try {
      const fields = { customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim() || null, seats, totalCents: cents, notes: form.notes.trim() || null };
      if (editingId) await reservationRequest(`/${encodeURIComponent(editingId)}`, 'PATCH', fields);
      else await reservationRequest('', 'POST', { tripId: form.tripId, ...fields });
      setForm(emptyForm); setEditingId(null); setShowForm(false); toast.success(editingId ? 'Reserva atualizada.' : 'Reserva cadastrada como pendente.'); await load();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Não foi possível cadastrar a reserva.'); }
    finally { setSaving(false); }
  };
  const changeStatus = async (id: string, status: ReservationStatus) => {
    setBusyId(id);
    try { await reservationRequest(`/${encodeURIComponent(id)}`, 'PATCH', { status }); toast.success('Situação atualizada.'); await load(); }
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
      setInstallmentFor(null); setAmount(''); setDueDate(''); toast.success('Parcela registrada.'); await load();
    } catch (e) { setInstallmentError(e instanceof Error ? e.message : 'Não foi possível registrar a parcela.'); }
    finally { setBusyId(null); }
  };
  const setPaid = async (reservationId: string, installmentId: string, paid: boolean) => {
    setBusyId(reservationId);
    try { await reservationRequest(`/${encodeURIComponent(reservationId)}/installments/${encodeURIComponent(installmentId)}`, 'PATCH', { paid }); toast.success(paid ? 'Recebimento registrado.' : 'Parcela marcada como pendente.'); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível atualizar a parcela.'); }
    finally { setBusyId(null); }
  };
  const deleteInstallment = async (reservationId: string, installmentId: string) => {
    setBusyId(reservationId);
    try { await reservationRequest(`/${encodeURIComponent(reservationId)}/installments/${encodeURIComponent(installmentId)}`, 'DELETE'); setPendingRemoval(null); toast.success('Parcela excluída.'); await load(); }
    catch (e) { setPendingRemoval(null); toast.error(e instanceof Error ? e.message : 'Não foi possível excluir a parcela.'); }
    finally { setBusyId(null); }
  };

  if (!isAdmin) return <div className="space-y-6"><PageHeader title="Reservas" /><ErrorState message="Somente administradores podem acessar as reservas." /></div>;
  return <div className="space-y-6">
    <PageHeader title="Reservas" description="Organize solicitações e registre parcelas manualmente." actions={<Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={() => { setFormError(''); setEditingId(null); setForm(emptyForm); setShowForm(!showForm); }}>{showForm ? 'Fechar cadastro' : 'Nova reserva'}</Button>} />
    <p className="text-sm text-surface-600">O registro é interno. Ele não confirma vagas automaticamente e não processa pagamentos.</p>
    {showForm && <form className="card p-5 sm:p-6 space-y-4" onSubmit={create} noValidate>
      <h2 className="text-lg font-semibold">{editingId ? 'Editar reserva' : 'Nova reserva'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="res-trip" label="Viagem" required><select id="res-trip" className="input" value={form.tripId} onChange={e => setForm({ ...form, tripId: e.target.value })} disabled={!!editingId} required><option value="">Selecione</option>{trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
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
      <Field id="res-filter-trip" label="Filtrar viagem"><select id="res-filter-trip" className="input" value={tripFilter} onChange={e => { setPage(1); setTripFilter(e.target.value); }}><option value="">Todas as viagens</option>{trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
      <Field id="res-filter-status" label="Situação"><select id="res-filter-status" className="input" value={statusFilter} onChange={e => { setPage(1); setStatusFilter(e.target.value); }}><option value="">Todas</option>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
    </div>
    {error && <ErrorState message={error} onRetry={() => void load()} />}
    {loading ? <p role="status" className="text-sm text-surface-600">Carregando reservas...</p> : !error && rows.length === 0 ? <EmptyState icon={<CalendarCheck />} title="Nenhuma reserva encontrada" text="Cadastre uma reserva ou ajuste os filtros." /> : <div className="space-y-4">{rows.map(row => <article className="card p-5 space-y-4" key={row.id}>
      <div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold text-surface-900">{row.customerName}</h2><p className="text-sm text-surface-600">{row.trip.title} · {row.seats} {row.seats === 1 ? 'lugar' : 'lugares'} · {formatMoney(row.totalCents)}</p>{row.customerPhone && <p className="text-sm text-surface-600">{row.customerPhone}</p>}{row.notes && <p className="text-sm text-surface-600 mt-1 whitespace-pre-wrap">{row.notes}</p>}<Button small className="mt-3" disabled={saving} onClick={() => { setEditingId(row.id); setForm({ tripId: row.tripId, customerName: row.customerName, customerPhone: row.customerPhone || '', seats: String(row.seats), total: (row.totalCents / 100).toFixed(2).replace('.', ','), notes: row.notes || '' }); setFormError(''); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar dados</Button></div><div><label className="label" htmlFor={`status-${row.id}`}>Situação</label><select id={`status-${row.id}`} className="input" value={row.status} disabled={busyId === row.id} onChange={e => void changeStatus(row.id, e.target.value as ReservationStatus)}>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div></div>
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
