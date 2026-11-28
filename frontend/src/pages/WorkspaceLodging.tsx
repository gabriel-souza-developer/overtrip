import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, request } from '../api';
import { formatIsoDayBR } from '../lib/dateInput';
import Button from '../components/Button';
import Field from '../components/Field';
import WorkspaceCalendar, { businessToday } from './WorkspaceCalendar';
import WorkspaceBlocks from './WorkspaceBlocks';
import Modal from '../components/Modal';
import { ArrowDownLeft, ArrowUpRight, BedDouble, CalendarDays, Plus } from 'lucide-react';
import './workspace-lodging.css';

type Unit = { id: string; name: string };
type Pagination = { page: number; totalPages: number; total: number };
type Movement = { arrivals: number; departures: number; overdueArrivals: number; overdueDepartures: number };
type Booking = { id: string; unitId: string; guestName: string; checkIn: string; checkOut: string; status: string; unit: Unit };

export default function WorkspaceLodging({ organizationId }: { organizationId: string }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [unitPage, setUnitPage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [unitPagination, setUnitPagination] = useState<Pagination>({ page: 1, totalPages: 0, total: 0 });
  const [bookingPagination, setBookingPagination] = useState<Pagination>({ page: 1, totalPages: 0, total: 0 });
  const [movement, setMovement] = useState<Movement>({ arrivals: 0, departures: 0, overdueArrivals: 0, overdueDepartures: 0 });
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [calendarVersion, setCalendarVersion] = useState(0);
  const [unitVersion, setUnitVersion] = useState(0);
  const requestSequence = useRef(0);
  const [unitName, setUnitName] = useState('');
  const [unitOpen, setUnitOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [form, setForm] = useState({ unitId: '', guestName: '', checkIn: '', checkOut: '' });
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const [pendingStay, setPendingStay] = useState<{ id: string; action: 'check-in' | 'check-out' } | null>(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [day, setDay] = useState(businessToday);
  const headers = { 'X-Organization-Id': organizationId };

  useEffect(() => {
    if (guestSearch.trim() === appliedSearch) return;
    const timer = window.setTimeout(() => { setBookingPage(1); setAppliedSearch(guestSearch.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [guestSearch, appliedSearch]);
  useEffect(() => {
    const timer = window.setInterval(() => setDay(businessToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(bookingPage), limit: '20' });
    if (appliedSearch) params.set('search', appliedSearch);
    if (statusFilter) params.set('status', statusFilter);
    const options = { headers: { 'X-Organization-Id': organizationId } };
    const [unitData, bookingData, movementData] = await Promise.all([
      request<{ units: Unit[]; pagination: Pagination }>(`/lodging/units?page=${unitPage}&limit=20`, options),
      request<{ reservations: Booking[]; pagination: Pagination }>(`/lodging/reservations?${params}`, options),
      request<Movement>(`/lodging/movement?date=${day}`, options),
    ]);
    return { unitData, bookingData, movementData };
  }, [organizationId, unitPage, bookingPage, appliedSearch, statusFilter, day]);
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const loadCurrent = useCallback(async () => {
    const id = ++requestSequence.current;
    let rebasing = false;
    setLoading(true); setError('');
    try {
      const { unitData, bookingData, movementData } = await load();
      if (id !== requestSequence.current) return;
      const lastPage = Math.max(1, bookingData.pagination.totalPages);
      if (bookingData.pagination.page > lastPage) {
        rebasing = true; setBookings([]); setBookingPage(lastPage);
        return;
      }
      setUnits(unitData.units); setUnitPagination(unitData.pagination);
      setBookings(bookingData.reservations); setBookingPagination(bookingData.pagination); setMovement(movementData);
      setInitialized(true); setLoadFailed(false);
    } catch (err) {
      if (id !== requestSequence.current) return;
      setUnits([]); setBookings([]); setLoadFailed(true);
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        setSelectedUnit(null); setForm({ unitId: '', guestName: '', checkIn: '', checkOut: '' }); setUnitName('');
      }
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados.');
    } finally { if (!rebasing && id === requestSequence.current) setLoading(false); }
  }, [load]);
  useEffect(() => { void loadCurrent(); return () => { requestSequence.current += 1; }; }, [loadCurrent, loadVersion]);
  const accessDenied = useCallback((err: ApiRequestError) => {
    requestSequence.current += 1; setUnits([]); setBookings([]); setSelectedUnit(null);
    setForm({ unitId: '', guestName: '', checkIn: '', checkOut: '' }); setUnitName('');
    setLoading(false); setLoadFailed(true); setError(err.message);
  }, []);
  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) accessDenied(err);
    else setError(err instanceof Error ? err.message : fallback);
  };
  const refreshAfterSave = async () => {
    // Reload the active filters/pages and calendar after a successful write.
    setCalendarVersion(value => value + 1);
    const id = ++requestSequence.current;
    let rebasing = false;
    setLoading(true);
    try {
      const { unitData, bookingData, movementData } = await latestLoad.current();
      if (id !== requestSequence.current) return;
      const lastPage = Math.max(1, bookingData.pagination.totalPages);
      if (bookingData.pagination.page > lastPage) {
        rebasing = true; setBookings([]); setBookingPage(lastPage);
        return;
      }
      setUnits(unitData.units); setUnitPagination(unitData.pagination);
      setBookings(bookingData.reservations); setBookingPagination(bookingData.pagination); setMovement(movementData);
    } catch (err) {
      if (id !== requestSequence.current) return;
      setUnits([]); setBookings([]); setLoadFailed(true);
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        setSelectedUnit(null); setForm({ unitId: '', guestName: '', checkIn: '', checkOut: '' }); setUnitName('');
      }
      setError(err instanceof ApiRequestError && (err.status === 401 || err.status === 403)
        ? err.message : 'Operação concluída, mas não foi possível atualizar a lista. Recarregue antes de repetir.');
    } finally { if (!rebasing && id === requestSequence.current) setLoading(false); }
  };
  const addUnit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request('/lodging/units', { method: 'POST', headers, body: JSON.stringify({ name: unitName.trim() }) });
      setUnitName(''); setUnitOpen(false); setUnitVersion(value => value + 1); await refreshAfterSave();
    } catch (err) { fail(err, 'Não foi possível cadastrar a unidade.'); }
    finally { setBusy(false); }
  };
  const addBooking = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request('/lodging/reservations', { method: 'POST', headers, body: JSON.stringify({ ...form, guestName: form.guestName.trim() }) });
      setForm({ unitId: '', guestName: '', checkIn: '', checkOut: '' }); setSelectedUnit(null); setBookingOpen(false); await refreshAfterSave();
    } catch (err) { fail(err, 'Não foi possível registrar a reserva.'); }
    finally { setBusy(false); }
  };
  const cancel = async (id: string) => {
    setBusy(true); setError('');
    try { await request(`/lodging/reservations/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers }); setPendingCancel(null); await refreshAfterSave(); }
    catch (err) { fail(err, 'Não foi possível cancelar a reserva.'); }
    finally { setBusy(false); }
  };
  const changeStay = async (id: string, action: 'check-in' | 'check-out') => {
    setBusy(true); setError('');
    try { await request(`/lodging/reservations/${encodeURIComponent(id)}/${action}`, { method: 'POST', headers }); setPendingStay(null); await refreshAfterSave(); }
    catch (err) { fail(err, 'Não foi possível atualizar a estadia.'); }
    finally { setBusy(false); }
  };
  const dateLabel = formatIsoDayBR;
  const statusLabel: Record<string, string> = { CONFIRMED: 'Confirmada', CHECKED_IN: 'Hóspede presente', CHECKED_OUT: 'Estadia encerrada', CANCELLED: 'Cancelada' };
  const { arrivals, departures, overdueArrivals, overdueDepartures } = movement;
  const unitOptions = selectedUnit && !units.some(unit => unit.id === selectedUnit.id) ? [selectedUnit, ...units] : units;

  return <div className="lodging-ui space-y-6">
    <div className="lodging-heading"><div><span className="lodging-eyebrow">HOSPEDAGEM</span><h2>Visão da pousada</h2><p>Acompanhe a ocupação, chegadas e reservas.</p></div><Button variant="primary" icon={<Plus size={16} />} disabled={!initialized || loadFailed} onClick={() => { setError(''); setBookingOpen(true); }}>Nova reserva</Button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading && !initialized ? <p role="status">Carregando reservas...</p> : loadFailed ? <Button disabled={loading} onClick={() => setLoadVersion(v => v + 1)}>{loading ? 'Carregando...' : 'Tentar carregar novamente'}</Button> : <>
      <section aria-label="Movimento de hoje"><div className="lodging-section-heading"><div><h3>Movimento de hoje</h3><p>O que precisa de atenção na hospedagem.</p></div></div>{loading ? <p role="status">Atualizando movimento...</p> : <><div className="lodging-stats"><div className="lodging-stat"><span>Chegadas previstas</span><ArrowDownLeft size={19} aria-hidden="true" /><strong>{arrivals}</strong><small>Para hoje</small></div><div className="lodging-stat"><span>Saídas previstas</span><ArrowUpRight size={19} aria-hidden="true" /><strong>{departures}</strong><small>Para hoje</small></div><div className="lodging-stat"><span>Chegadas pendentes</span><CalendarDays size={19} aria-hidden="true" /><strong>{overdueArrivals}</strong><small>De dias anteriores</small></div><div className="lodging-stat"><span>Saídas pendentes</span><BedDouble size={19} aria-hidden="true" /><strong>{overdueDepartures}</strong><small>De dias anteriores</small></div></div><p className="sr-only">{arrivals} {arrivals === 1 ? 'chegada prevista' : 'chegadas previstas'} · {departures} {departures === 1 ? 'saída prevista' : 'saídas previstas'}{(overdueArrivals > 0 || overdueDepartures > 0) && ` · Pendências anteriores: ${overdueArrivals} ${overdueArrivals === 1 ? 'chegada' : 'chegadas'} · ${overdueDepartures} ${overdueDepartures === 1 ? 'saída' : 'saídas'}`}</p></>}</section>
      <WorkspaceCalendar organizationId={organizationId} version={calendarVersion} onAccessDenied={accessDenied} />
      <div className="lodging-unit-action"><div><h3>Suas unidades</h3><p>Cadastre as acomodações disponíveis para reserva.</p></div><Button onClick={() => { setError(''); setUnitOpen(true); }}>Cadastrar unidade</Button></div>
      <Modal open={unitOpen} onOpenChange={open => { if (!busy) setUnitOpen(open); }} title="Cadastrar unidade" description="Adicione uma acomodação à pousada.">
      <form className="workspace-form space-y-4" onSubmit={addUnit}>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <Field id="unit-name" label="Nome da unidade" required><input id="unit-name" className="input" value={unitName} onChange={e => setUnitName(e.target.value)} required maxLength={100} /></Field>
        <Button type="submit" variant="primary" disabled={busy || loading}>Cadastrar unidade</Button>
      </form></Modal>
      <Modal open={bookingOpen} onOpenChange={open => { if (!busy) setBookingOpen(open); }} title="Nova reserva" description="A saída não ocupa a noite desse dia.">
      <form className="workspace-form space-y-4" onSubmit={addBooking}>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <Field id="stay-unit" label="Unidade" required><select id="stay-unit" className="input" required disabled={loading} value={form.unitId} onChange={e => { setSelectedUnit(unitOptions.find(unit => unit.id === e.target.value) || null); setForm({ ...form, unitId: e.target.value }); }}><option value="">Selecione</option>{unitOptions.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
        {unitPagination.totalPages > 1 && <div className="flex items-center gap-2"><Button small disabled={unitPage <= 1 || busy || loading} onClick={() => setUnitPage(unitPage - 1)}>Unidades anteriores</Button><span>Página {unitPage} de {unitPagination.totalPages}</span><Button small disabled={unitPage >= unitPagination.totalPages || busy || loading} onClick={() => setUnitPage(unitPage + 1)}>Próximas unidades</Button></div>}
        <Field id="stay-guest" label="Hóspede" required><input id="stay-guest" className="input" required maxLength={120} value={form.guestName} onChange={e => setForm({ ...form, guestName: e.target.value })} /></Field>
        <Field id="stay-in" label="Entrada" required><input id="stay-in" className="input" type="date" required value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })} /></Field>
        <Field id="stay-out" label="Saída" required><input id="stay-out" className="input" type="date" required min={form.checkIn || undefined} value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })} /></Field>
        <Button type="submit" variant="primary" disabled={busy || loading || !unitOptions.length}>Registrar reserva</Button>
      </form></Modal>
      <section className="lodging-reservations card p-5 space-y-4"><div className="lodging-section-heading"><div><span className="lodging-eyebrow">RESERVAS</span><h3>Reservas registradas</h3><p>Consulte e acompanhe as estadias.</p></div></div>
        {<div className="flex flex-wrap gap-3"><Field id="stay-search" label="Buscar hóspede"><input id="stay-search" type="search" className="input" value={guestSearch} maxLength={120} onChange={event => setGuestSearch(event.target.value)} /></Field><Field id="stay-status" label="Situação da reserva"><select id="stay-status" className="input" value={statusFilter} onChange={event => { setBookingPage(1); setStatusFilter(event.target.value); }}><option value="">Todas</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>}
        {loading || guestSearch.trim() !== appliedSearch ? <p role="status">Buscando reservas...</p> : !bookings.length && <p>{appliedSearch || statusFilter ? 'Nenhuma reserva encontrada com esses filtros.' : 'Nenhuma reserva registrada.'}</p>}
        {!loading && guestSearch.trim() === appliedSearch && bookings.map(booking => <article key={booking.id} className="card p-4 space-y-2"><strong>{booking.guestName}</strong><p>{booking.unit.name} · {dateLabel(booking.checkIn)} a {dateLabel(booking.checkOut)}</p><p>{statusLabel[booking.status] || booking.status}</p>{pendingStay?.id === booking.id ? <div className="flex flex-wrap items-center gap-2"><span>A data prevista é {dateLabel(pendingStay.action === 'check-in' ? booking.checkIn : booking.checkOut)}. Confirmar o registro agora?</span><Button small disabled={busy} onClick={() => setPendingStay(null)}>Voltar</Button><Button small variant="primary" disabled={busy} onClick={() => void changeStay(booking.id, pendingStay.action)}>Confirmar registro</Button></div> : <>{booking.status === 'CONFIRMED' && <Button small disabled={busy} onClick={() => booking.checkIn === day ? void changeStay(booking.id, 'check-in') : setPendingStay({ id: booking.id, action: 'check-in' })}>Registrar chegada</Button>} {booking.status === 'CHECKED_IN' && <Button small disabled={busy} onClick={() => booking.checkOut === day ? void changeStay(booking.id, 'check-out') : setPendingStay({ id: booking.id, action: 'check-out' })}>Registrar saída</Button>}</>} {booking.status === 'CONFIRMED' && (pendingCancel === booking.id ? <div className="flex gap-2"><span>Cancelar esta reserva?</span><Button small disabled={busy} onClick={() => setPendingCancel(null)}>Voltar</Button><Button small variant="danger" disabled={busy} onClick={() => void cancel(booking.id)}>Confirmar cancelamento</Button></div> : <Button small disabled={busy} onClick={() => setPendingCancel(booking.id)}>Cancelar reserva</Button>)}</article>)}
        {!loading && bookingPagination.totalPages > 1 && <div className="flex items-center gap-3"><Button small disabled={bookingPage <= 1 || busy} onClick={() => setBookingPage(bookingPage - 1)}>Reservas anteriores</Button><span>Página {bookingPage} de {bookingPagination.totalPages}</span><Button small disabled={bookingPage >= bookingPagination.totalPages || busy} onClick={() => setBookingPage(bookingPage + 1)}>Próximas reservas</Button></div>}
      </section>
      <WorkspaceBlocks key={unitVersion} organizationId={organizationId} version={calendarVersion} onAccessDenied={accessDenied} onChanged={() => setCalendarVersion(value => value + 1)} />
    </>}
  </div>;
}
