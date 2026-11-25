import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CalendarCheck, History, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import {
  organizationApi, type OrgInstallment, type OrgLead, type OrgReservation, type OrgReservationAuditAction,
  type OrgReservationAuditEntry, type OrgReservationStatus, type OrgTrip,
} from '../api/organizations';
import { formatDateBR } from '../lib/dateInput';
import { reservationMoneyToCents } from '../lib/reservationMoney';
import type { OrganizationOutletContext } from './OrganizationLayout';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Button from '../components/Button';
import Field from '../components/Field';
import StatusBadge, { type StatusTone } from '../components/StatusBadge';

const STATUS_LABELS: Record<OrgReservationStatus, string> = { PENDING: 'Pendente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada' };
// Mesma lógica de pages/Trips.tsx: cores fixas por estado, nunca derivadas da marca.
const STATUS_TONE: Record<OrgReservationStatus, StatusTone> = { PENDING: 'warning', CONFIRMED: 'success', CANCELLED: 'danger' };
const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as OrgReservationStatus[];
const formatMoney = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const textFromCents = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const dayFromIso = (iso: string | null) => iso ? iso.slice(0, 10) : '';

// Rótulo da ação, nunca o nome técnico do model/enum. Sem "quem fez": o
// servidor devolve só o id interno de quem mudou (actorUserId), e não há
// hoje como resolver isso para nome/e-mail dentro da própria empresa com
// segurança — mostrar o id cru pareceria um nome ou um código de erro, o
// que a tarefa pede para nunca fazer. Quando existir uma forma segura de
// resolver o autor, adicionar a coluna aqui é só reusar esta mesma linha.
const HISTORY_ACTION_LABELS: Record<OrgReservationAuditAction, string> = {
  RESERVATION_CREATED: 'Reserva criada',
  RESERVATION_UPDATED: 'Reserva atualizada',
  INSTALLMENT_CREATED: 'Parcela adicionada',
  INSTALLMENT_UPDATED: 'Parcela atualizada',
  INSTALLMENT_DELETED: 'Parcela excluída',
};
const formatHistoryWhen = (iso: string) => new Date(iso).toLocaleString('pt-BR');

interface ReservationForm { tripId: string; customerName: string; customerPhone: string; seats: string; totalText: string; leadId: string; status: OrgReservationStatus }
const emptyForm: ReservationForm = { tripId: '', customerName: '', customerPhone: '', seats: '1', totalText: '', leadId: '', status: 'PENDING' };
interface InstallmentForm { amountText: string; dueDate: string }
const emptyInstallmentForm: InstallmentForm = { amountText: '', dueDate: '' };

export default function OrganizationReservations() {
  const { organization, role } = useOutletContext<OrganizationOutletContext>();
  const allowed = role === 'OWNER' || role === 'ADMIN';
  const [rows, setRows] = useState<OrgReservation[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trips, setTrips] = useState<OrgTrip[]>([]);
  const [leads, setLeads] = useState<OrgLead[]>([]);
  const [tripPage, setTripPage] = useState(0);
  const [tripPages, setTripPages] = useState(0);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState('');
  const [leadPage, setLeadPage] = useState(0);
  const [leadPages, setLeadPages] = useState(0);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState('');

  const [editing, setEditing] = useState<OrgReservation | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ReservationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [installmentForm, setInstallmentForm] = useState<InstallmentForm>(emptyInstallmentForm);
  const [installmentError, setInstallmentError] = useState('');
  const [installmentSaving, setInstallmentSaving] = useState(false);
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const [installmentEditForm, setInstallmentEditForm] = useState<InstallmentForm>(emptyInstallmentForm);
  const [deletingInstallment, setDeletingInstallment] = useState<OrgInstallment | null>(null);

  const [viewingHistory, setViewingHistory] = useState<OrgReservation | null>(null);
  const [historyEntries, setHistoryEntries] = useState<OrgReservationAuditEntry[]>([]);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  // Página PEDIDA, atualizada ao disparar a chamada — nunca só quando ela dá
  // certo. historyPagination.page só avança com uma resposta bem-sucedida;
  // se a página 2 falhar, ele continua em 1, e usá-lo para repetir refaria a
  // página 1 em vez da que realmente falhou. "Tentar de novo" sempre repete
  // historyRequestedPage, não historyPagination.page.
  const [historyRequestedPage, setHistoryRequestedPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  // Geração da requisição de histórico em voo + o controller para abortá-la:
  // ao trocar de reserva, de página ou de empresa, ou ao fechar o modal, a
  // resposta antiga (que pode chegar depois da nova, fora de ordem) nunca
  // deve atualizar a tela — ela é descartada comparando o id capturado no
  // início da chamada com o id atual da referência, e o fetch em si é
  // abortado como reforço (quando o ambiente honra o AbortSignal).
  const historyRequestIdRef = useRef(0);
  const historyAbortRef = useRef<AbortController | null>(null);
  const invalidateHistoryRequest = useCallback(() => {
    historyRequestIdRef.current += 1;
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
  }, []);

  const load = useCallback(async (page = 1) => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const data = await organizationApi.reservations(organization.id, { page, limit: 20 });
      setRows(data.data); setPagination(data.pagination);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as reservas.');
    } finally { setLoading(false); }
  }, [organization.id, allowed]);
  useEffect(() => { void load(1); }, [load]);

  const loadHistory = useCallback(async (reservationId: string, page: number) => {
    invalidateHistoryRequest(); // qualquer requisição anterior (outra reserva ou página) deixa de valer
    const requestId = historyRequestIdRef.current;
    const controller = new AbortController();
    historyAbortRef.current = controller;
    setHistoryRequestedPage(page); // guarda já aqui, mesmo que a chamada abaixo falhe
    setHistoryLoading(true); setHistoryError('');
    try {
      const data = await organizationApi.reservationAudit(organization.id, reservationId, { page, limit: 10 }, { signal: controller.signal });
      if (historyRequestIdRef.current !== requestId) return; // uma chamada mais nova já é a atual: descarta esta resposta tardia
      setHistoryEntries(data.data); setHistoryPagination(data.pagination);
    } catch (err) {
      if (historyRequestIdRef.current !== requestId) return;
      if (err instanceof Error && err.name === 'AbortError') return; // cancelada por nós mesmos, não é uma falha a reportar
      setHistoryEntries([]);
      setHistoryError(err instanceof Error ? err.message : 'Não foi possível carregar o histórico desta reserva.');
    } finally {
      if (historyRequestIdRef.current === requestId) setHistoryLoading(false);
    }
  }, [organization.id, invalidateHistoryRequest]);
  const openHistory = (row: OrgReservation) => {
    setViewingHistory(row); setHistoryEntries([]); setHistoryError('');
    setHistoryPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
    void loadHistory(row.id, 1);
  };
  const closeHistory = () => {
    invalidateHistoryRequest();
    setViewingHistory(null); setHistoryEntries([]); setHistoryError(''); setHistoryLoading(false); setHistoryRequestedPage(1);
  };
  // Trocar de empresa é uma troca de contexto completa: nenhuma resposta de
  // histórico da empresa anterior pode aparecer depois, nem o modal deve
  // continuar aberto mostrando a reserva de outra empresa.
  useEffect(() => {
    invalidateHistoryRequest();
    setViewingHistory(null); setHistoryEntries([]); setHistoryError(''); setHistoryLoading(false); setHistoryRequestedPage(1);
  }, [organization.id, invalidateHistoryRequest]);
  // Desmontar a página (navegar para outra rota) com uma requisição de
  // histórico em voo não deve deixá-la rodando nem arriscar um setState
  // tardio num componente que já saiu de cena.
  useEffect(() => () => invalidateHistoryRequest(), [invalidateHistoryRequest]);

  const loadTrips = useCallback(async (page: number) => {
    setTripLoading(true); setTripError('');
    try {
      const data = await organizationApi.trips(organization.id, { page, limit: 100 });
      setTrips(previous => page === 1 ? data.data : [...previous, ...data.data.filter(item => !previous.some(old => old.id === item.id))]);
      setTripPage(data.pagination.page); setTripPages(data.pagination.totalPages);
    } catch { setTripError('Não foi possível carregar as viagens. Tente novamente.'); }
    finally { setTripLoading(false); }
  }, [organization.id]);
  const loadLeads = useCallback(async (page: number) => {
    setLeadLoading(true); setLeadError('');
    try {
      const data = await organizationApi.leads(organization.id, { page, limit: 100 });
      setLeads(previous => page === 1 ? data.data : [...previous, ...data.data.filter(item => !previous.some(old => old.id === item.id))]);
      setLeadPage(data.pagination.page); setLeadPages(data.pagination.totalPages);
    } catch { setLeadError('Não foi possível carregar os interessados. Tente novamente.'); }
    finally { setLeadLoading(false); }
  }, [organization.id]);
  useEffect(() => {
    if (!allowed) return;
    setTrips([]); setLeads([]); setTripPage(0); setLeadPage(0); setTripPages(0); setLeadPages(0);
    void loadTrips(1); void loadLeads(1);
  }, [allowed, loadTrips, loadLeads]);

  const openCreate = () => { setEditing(null); setCreating(true); setForm(emptyForm); setFormError(''); };
  const openEdit = (row: OrgReservation) => {
    setCreating(false); setEditing(row); setFormError('');
    setForm({
      tripId: row.tripId, customerName: row.customerName, customerPhone: row.customerPhone ?? '',
      seats: String(row.seats), totalText: textFromCents(row.totalCents), leadId: row.leadId ?? '', status: row.status,
    });
  };
  const closeForm = () => {
    if (saving || installmentSaving) return;
    setCreating(false); setEditing(null); setForm(emptyForm);
    setInstallmentForm(emptyInstallmentForm); setInstallmentError(''); setEditingInstallmentId(null);
  };
  const patch = (changes: Partial<ReservationForm>) => setForm((prev) => ({ ...prev, ...changes }));

  // Toda mutação de parcela devolve a reserva inteira com o updatedAt já
  // avançado: atualiza o formulário aberto e a linha da lista, para que a
  // próxima ação (outra parcela, ou salvar a reserva) use a versão certa.
  const applyReservationUpdate = (updated: OrgReservation) => {
    setEditing(updated);
    setRows((previous) => previous.map((row) => (row.id === updated.id ? updated : row)));
  };

  const addInstallment = async () => {
    if (!editing || saving || installmentSaving) return;
    const amountCents = reservationMoneyToCents(installmentForm.amountText);
    if (amountCents === null || amountCents < 1) { setInstallmentError('Informe um valor de parcela válido, maior que zero.'); return; }
    setInstallmentSaving(true); setInstallmentError('');
    try {
      const updated = await organizationApi.createInstallment(organization.id, editing.id, {
        amountCents, dueDate: installmentForm.dueDate || null, expectedUpdatedAt: editing.updatedAt,
      });
      applyReservationUpdate(updated);
      setInstallmentForm(emptyInstallmentForm);
    } catch (err) {
      setInstallmentError(err instanceof Error ? err.message : 'Não foi possível adicionar a parcela.');
    } finally {
      setInstallmentSaving(false);
    }
  };

  const startEditInstallment = (item: OrgInstallment) => {
    setEditingInstallmentId(item.id);
    setInstallmentEditForm({ amountText: textFromCents(item.amountCents), dueDate: dayFromIso(item.dueDate) });
    setInstallmentError('');
  };
  const cancelEditInstallment = () => { setEditingInstallmentId(null); setInstallmentEditForm(emptyInstallmentForm); };

  const saveInstallmentEdit = async (item: OrgInstallment) => {
    if (!editing || saving || installmentSaving) return;
    const amountCents = reservationMoneyToCents(installmentEditForm.amountText);
    if (amountCents === null || amountCents < 1) { setInstallmentError('Informe um valor de parcela válido, maior que zero.'); return; }
    const changes: { amountCents?: number; dueDate?: string | null } = {};
    if (amountCents !== item.amountCents) changes.amountCents = amountCents;
    if (installmentEditForm.dueDate !== dayFromIso(item.dueDate)) changes.dueDate = installmentEditForm.dueDate || null;
    if (Object.keys(changes).length === 0) { cancelEditInstallment(); return; }
    setInstallmentSaving(true); setInstallmentError('');
    try {
      const updated = await organizationApi.updateInstallment(organization.id, editing.id, item.id, { ...changes, expectedUpdatedAt: editing.updatedAt });
      applyReservationUpdate(updated);
      cancelEditInstallment();
    } catch (err) {
      setInstallmentError(err instanceof Error ? err.message : 'Não foi possível salvar a parcela.');
    } finally {
      setInstallmentSaving(false);
    }
  };

  const togglePaid = async (item: OrgInstallment) => {
    if (!editing || saving || installmentSaving) return;
    setInstallmentSaving(true); setInstallmentError('');
    try {
      const updated = await organizationApi.updateInstallment(organization.id, editing.id, item.id, { paid: !item.paidAt, expectedUpdatedAt: editing.updatedAt });
      applyReservationUpdate(updated);
    } catch (err) {
      setInstallmentError(err instanceof Error ? err.message : 'Não foi possível atualizar o recebimento.');
    } finally {
      setInstallmentSaving(false);
    }
  };

  const confirmDeleteInstallment = async () => {
    if (!editing || !deletingInstallment || saving || installmentSaving) return;
    setInstallmentSaving(true); setInstallmentError('');
    try {
      const updated = await organizationApi.deleteInstallment(organization.id, editing.id, deletingInstallment.id, { expectedUpdatedAt: editing.updatedAt });
      applyReservationUpdate(updated);
      setDeletingInstallment(null);
    } catch (err) {
      setInstallmentError(err instanceof Error ? err.message : 'Não foi possível excluir a parcela.');
      setDeletingInstallment(null);
    } finally {
      setInstallmentSaving(false);
    }
  };

  const save = async () => {
    if (saving || installmentSaving) return;
    const totalCents = reservationMoneyToCents(form.totalText);
    const seats = Number(form.seats);
    if (creating && !form.tripId) { setFormError('Selecione a viagem.'); return; }
    if (!form.customerName.trim()) { setFormError('Informe o nome do cliente.'); return; }
    if (!Number.isInteger(seats) || seats < 1) { setFormError('Informe um número de lugares válido.'); return; }
    if (totalCents === null || totalCents > 100_000_000) { setFormError('Informe um valor total válido, com até duas casas decimais.'); return; }
    setSaving(true); setFormError('');
    try {
      if (editing) {
        const essentials: Record<string, unknown> = {};
        if (form.customerName.trim() !== editing.customerName) essentials.customerName = form.customerName.trim();
        if ((form.customerPhone.trim() || null) !== (editing.customerPhone || null)) essentials.customerPhone = form.customerPhone.trim() || null;
        if (seats !== editing.seats) essentials.seats = seats;
        if (totalCents !== editing.totalCents) essentials.totalCents = totalCents;
        if ((form.leadId || null) !== (editing.leadId || null)) essentials.leadId = form.leadId || null;
        if (form.status !== editing.status) essentials.status = form.status;
        if (Object.keys(essentials).length) await organizationApi.updateReservation(organization.id, editing.id, { ...essentials, expectedUpdatedAt: editing.updatedAt });
      } else {
        await organizationApi.createReservation(organization.id, {
          tripId: form.tripId, customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim() || null,
          seats, totalCents, leadId: form.leadId || null,
        });
      }
      setCreating(false); setEditing(null); setForm(emptyForm);
      await load(editing ? pagination.page : 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a reserva.');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reservas" />
        <EmptyState icon={<ShieldAlert />} title="Acesso restrito" text="Somente proprietários e administradores desta empresa podem consultar as reservas." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservas"
        description="Cadastre e edite as reservas administrativas desta empresa."
        actions={<Button variant="primary" icon={<Plus className="w-4 h-4" aria-hidden="true" />} onClick={openCreate} disabled={trips.length === 0}>Nova reserva</Button>}
      />
      <p className="text-sm text-surface-600">O registro é manual. Ele não confirma vagas automaticamente e não processa pagamentos.</p>
      {tripLoading && trips.length === 0 && <p role="status" className="text-sm text-surface-600">Carregando viagens...</p>}
      {tripError && trips.length === 0 && <div className="space-y-2"><p role="alert" className="text-sm text-red-700">{tripError}</p><Button small onClick={() => void loadTrips(1)}>Tentar novamente viagens</Button></div>}
      {!tripLoading && !tripError && trips.length === 0 && <p className="text-sm text-surface-600">Cadastre uma viagem antes de criar uma reserva.</p>}
      {error && <ErrorState message={error} onRetry={() => void load(pagination.page)} />}
      {error ? null : loading ? (
        <p role="status" className="text-sm text-surface-600">Carregando reservas...</p>
      ) : !error && rows.length === 0 ? (
        <EmptyState icon={<CalendarCheck />} title="Nenhuma reserva encontrada" text="Cadastre a primeira reserva desta empresa." action={trips.length > 0 ? <Button variant="primary" onClick={openCreate}>Nova reserva</Button> : undefined} />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <article key={row.id} className="card p-5 space-y-3">
              <div className="flex flex-wrap justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-semibold text-surface-900 break-words">{row.customerName}</h2>
                  <p className="text-sm text-surface-600">{row.trip.title} · {row.seats} {row.seats === 1 ? 'lugar' : 'lugares'} · {formatMoney(row.totalCents)}</p>
                  {row.customerPhone && <p className="text-sm text-surface-600">{row.customerPhone}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge tone={STATUS_TONE[row.status]} className="self-start">{STATUS_LABELS[row.status]}</StatusBadge>
                  <div className="flex gap-2">
                    <Button small icon={<History className="w-4 h-4" aria-hidden="true" />} onClick={() => openHistory(row)} aria-label={`Ver histórico da reserva de ${row.customerName}`}>
                      <span className="hidden sm:inline">Histórico</span>
                    </Button>
                    <Button small icon={<Pencil className="w-4 h-4" aria-hidden="true" />} onClick={() => openEdit(row)} aria-label={`Editar reserva de ${row.customerName}`}>
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                  </div>
                </div>
              </div>
              {row.installments.length > 0 && (
                <div className="border-t border-surface-200 pt-3">
                  <h3 className="font-semibold text-sm mb-2">Parcelas</h3>
                  <ul className="space-y-1">
                    {row.installments.map((item) => (
                      <li key={item.id} className="text-sm text-surface-600">
                        {formatMoney(item.amountCents)} · {item.dueDate ? `Vencimento: ${formatDateBR(item.dueDate)}` : 'Sem vencimento'} · {item.paidAt ? 'Recebida' : 'Pendente'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {!loading && !error && <Pagination pagination={pagination} onChange={(page) => void load(page)} />}

      <Modal
        open={creating || !!editing}
        onOpenChange={(open) => { if (!open) closeForm(); }}
        title={creating ? 'Nova reserva' : 'Editar reserva'}
        description="Registro manual: não confirma vagas automaticamente e não processa pagamentos."
        widthClass="max-w-2xl"
        footer={
          <>
            <Button onClick={closeForm} disabled={saving || installmentSaving}>Cancelar</Button>
            <Button variant="primary" loading={saving} disabled={installmentSaving} loadingText="Salvando..." onClick={() => void save()}>Salvar</Button>
          </>
        }
      >
        <form id="org-reservation-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="space-y-4">
          {formError && <div className="alert-error" role="alert">{formError}</div>}
          <Field id="org-reservation-trip" label="Viagem" required={creating}>
            {creating ? (
              <select id="org-reservation-trip" className="select" value={form.tripId} onChange={(e) => patch({ tripId: e.target.value, leadId: '' })}>
                <option value="">Selecione a viagem</option>
                {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
              </select>
            ) : (
              <input id="org-reservation-trip" className="input" disabled value={rows.find((r) => r.id === editing?.id)?.trip.title ?? ''} />
            )}
          </Field>
          {creating && tripPage < tripPages && <Button type="button" small disabled={tripLoading} onClick={() => void loadTrips(tripPage + 1)}>{tripLoading ? 'Carregando viagens...' : 'Carregar mais viagens'}</Button>}
          {creating && tripError && trips.length > 0 && <div><p role="alert" className="text-sm text-red-700">{tripError}</p><Button type="button" small onClick={() => void loadTrips(tripPage + 1)}>Tentar novamente viagens</Button></div>}
          <Field id="org-reservation-name" label="Cliente" required>
            <input id="org-reservation-name" className="input" value={form.customerName} onChange={(e) => patch({ customerName: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="org-reservation-phone" label="Telefone">
              <input id="org-reservation-phone" className="input" value={form.customerPhone} onChange={(e) => patch({ customerPhone: e.target.value })} />
            </Field>
            <Field id="org-reservation-seats" label="Lugares" required>
              <input id="org-reservation-seats" type="number" min={1} max={100} className="input" value={form.seats} onChange={(e) => patch({ seats: e.target.value })} />
            </Field>
          </div>
          <Field id="org-reservation-total" label="Valor total (R$)" required>
            <input id="org-reservation-total" className="input" inputMode="decimal" value={form.totalText} onChange={(e) => patch({ totalText: e.target.value })} />
          </Field>
          <Field id="org-reservation-lead" label="Interessado vinculado" hint="Só aceita um interessado desta empresa sem viagem ou já associado à mesma viagem.">
            <select id="org-reservation-lead" className="select" value={form.leadId} onChange={(e) => patch({ leadId: e.target.value })}>
              <option value="">Nenhum</option>
              {form.leadId && !leads.some(lead => lead.id === form.leadId && (!lead.tripId || lead.tripId === form.tripId)) && <option value={form.leadId}>Interessado vinculado (carregue mais para identificar)</option>}
              {leads.filter((lead) => !lead.tripId || lead.tripId === form.tripId).map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
            </select>
          </Field>
          {leadLoading && leads.length === 0 && <p role="status" className="text-sm text-surface-600">Carregando interessados...</p>}
          {leadPage < leadPages && <Button type="button" small disabled={leadLoading} onClick={() => void loadLeads(leadPage + 1)}>{leadLoading ? 'Carregando interessados...' : 'Carregar mais interessados'}</Button>}
          {leadError && <div><p role="alert" className="text-sm text-red-700">{leadError}</p><Button type="button" small onClick={() => void loadLeads(leadPage + 1)}>Tentar novamente interessados</Button></div>}
          {editing && (
            <Field id="org-reservation-status" label="Status">
              <select id="org-reservation-status" className="select" value={form.status} onChange={(e) => patch({ status: e.target.value as OrgReservationStatus })}>
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
              </select>
            </Field>
          )}

          {editing && (
            <div className="border-t border-surface-200 pt-4 space-y-3">
              <h3 className="font-semibold text-sm text-surface-900">Parcelas</h3>
              <p className="text-sm text-surface-600">Registro manual de recebimento. Não é uma cobrança nem confirma pagamento.</p>
              {editing.status === 'CANCELLED' && <p className="text-sm text-red-700" role="alert">Reserva cancelada: as parcelas não podem mais ser alteradas.</p>}
              {installmentError && <div className="alert-error" role="alert">{installmentError}</div>}
              {editing.installments.length === 0 ? (
                <p className="text-sm text-surface-600">Nenhuma parcela cadastrada.</p>
              ) : (
                <ul className="space-y-2">
                  {editing.installments.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 border border-surface-200 rounded-lg p-3">
                      {editingInstallmentId === item.id ? (
                        <>
                          <input className="input w-28" inputMode="decimal" aria-label="Valor da parcela (R$)" value={installmentEditForm.amountText} onChange={(e) => setInstallmentEditForm((prev) => ({ ...prev, amountText: e.target.value }))} />
                          <input className="input w-36" type="date" aria-label="Vencimento da parcela" value={installmentEditForm.dueDate} onChange={(e) => setInstallmentEditForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
                          <Button type="button" small variant="primary" loading={installmentSaving} disabled={saving} loadingText="Salvando..." onClick={() => void saveInstallmentEdit(item)}>Salvar</Button>
                          <Button type="button" small onClick={cancelEditInstallment} disabled={saving || installmentSaving}>Cancelar</Button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-surface-900">{formatMoney(item.amountCents)}</span>
                          <span className="text-sm text-surface-600">{item.dueDate ? `Vencimento: ${formatDateBR(item.dueDate)}` : 'Sem vencimento'}</span>
                          <span className={`text-sm ${item.paidAt ? 'text-green-700' : 'text-surface-600'}`}>{item.paidAt ? 'Recebida' : 'Pendente'}</span>
                          <div className="flex gap-2 ml-auto">
                            <Button type="button" small disabled={saving || installmentSaving || editing.status === 'CANCELLED'} onClick={() => void togglePaid(item)}>
                              {item.paidAt ? 'Desmarcar recebimento' : 'Marcar recebida'}
                            </Button>
                            <Button type="button" small disabled={saving || installmentSaving || editing.status === 'CANCELLED' || !!item.paidAt} icon={<Pencil className="w-4 h-4" aria-hidden="true" />} onClick={() => startEditInstallment(item)} aria-label={`Editar parcela de ${formatMoney(item.amountCents)}`} />
                            <Button type="button" small disabled={saving || installmentSaving || editing.status === 'CANCELLED' || !!item.paidAt} icon={<Trash2 className="w-4 h-4" aria-hidden="true" />} onClick={() => setDeletingInstallment(item)} aria-label={`Excluir parcela de ${formatMoney(item.amountCents)}`} />
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editing.status !== 'CANCELLED' && editing.installments.length < 120 && (
                <div className="flex flex-wrap items-end gap-2 pt-2">
                  <Field id="org-installment-amount" label="Nova parcela (R$)">
                    <input id="org-installment-amount" className="input w-28" inputMode="decimal" value={installmentForm.amountText} onChange={(e) => setInstallmentForm((prev) => ({ ...prev, amountText: e.target.value }))} />
                  </Field>
                  <Field id="org-installment-due" label="Vencimento">
                    <input id="org-installment-due" className="input w-36" type="date" value={installmentForm.dueDate} onChange={(e) => setInstallmentForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
                  </Field>
                  <Button type="button" small variant="primary" loading={installmentSaving} disabled={saving} loadingText="Adicionando..." onClick={() => void addInstallment()}>Adicionar parcela</Button>
                </div>
              )}
              {editing.installments.length >= 120 && <p className="text-sm text-surface-600">Limite de 120 parcelas por reserva atingido.</p>}
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deletingInstallment}
        onOpenChange={(open) => { if (!open && !installmentSaving) setDeletingInstallment(null); }}
        title="Excluir parcela"
        description={deletingInstallment ? `Excluir a parcela de ${formatMoney(deletingInstallment.amountCents)}? Esta ação não pode ser desfeita.` : ''}
        confirmLabel="Excluir"
        busyLabel="Excluindo..."
        busy={installmentSaving}
        onConfirm={() => void confirmDeleteInstallment()}
      />

      <Modal
        open={!!viewingHistory}
        onOpenChange={(open) => { if (!open) closeHistory(); }}
        title="Histórico da reserva"
        description={viewingHistory ? `Ações registradas em ${viewingHistory.trip.title} desde a ativação deste histórico, da mais recente à mais antiga. Mudanças feitas antes disso podem não aparecer aqui.` : undefined}
        widthClass="max-w-xl"
        footer={<Button onClick={closeHistory}>Fechar</Button>}
      >
        {historyError ? (
          <ErrorState message={historyError} onRetry={() => viewingHistory && void loadHistory(viewingHistory.id, historyRequestedPage)} />
        ) : historyLoading && historyEntries.length === 0 ? (
          <p role="status" className="text-sm text-surface-600">Carregando histórico...</p>
        ) : historyEntries.length === 0 ? (
          <EmptyState icon={<History />} title="Nenhuma atividade registrada" text="Nada desde a ativação deste histórico; mudanças mais antigas podem não ter sido registradas, e as próximas aparecerão aqui." />
        ) : (
          <div className="space-y-2">
            <ul className="space-y-2">
              {historyEntries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border border-surface-200 rounded-lg p-3">
                  <span className="text-sm font-medium text-surface-900">{HISTORY_ACTION_LABELS[entry.action]}</span>
                  <time className="text-sm text-surface-600" dateTime={entry.createdAt}>{formatHistoryWhen(entry.createdAt)}</time>
                </li>
              ))}
            </ul>
            <Pagination pagination={historyPagination} onChange={(page) => viewingHistory && void loadHistory(viewingHistory.id, page)} />
          </div>
        )}
      </Modal>
    </div>
  );
}
