import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, request } from '../api';
import Button from '../components/Button';
import Field from '../components/Field';
import { businessToday } from './WorkspaceCalendar';

type Table = { id: string; name: string; capacity: number };
type Pagination = { page: number; totalPages: number; total: number };
type Movement = { expected: number; arrived: number; overdue: number };
type Booking = { id: string; tableId: string; guestName: string; partySize: number; date: string; shift: 'ALMOCO' | 'JANTAR'; time: string; status: string; table: Table };

const shiftLabel: Record<string, string> = { ALMOCO: 'Almoço', JANTAR: 'Jantar' };
const statusLabel: Record<string, string> = { CONFIRMED: 'Confirmada', ARRIVED: 'Grupo presente', NO_SHOW: 'Ausência', CANCELLED: 'Cancelada' };

export default function WorkspaceRestaurant({ organizationId }: { organizationId: string }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [tablePagination, setTablePagination] = useState<Pagination>({ page: 1, totalPages: 0, total: 0 });
  const [bookingPagination, setBookingPagination] = useState<Pagination>({ page: 1, totalPages: 0, total: 0 });
  const [movement, setMovement] = useState<Movement>({ expected: 0, arrived: 0, overdue: 0 });
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [appliedSearch, setAppliedSearch] = useState('');
  const requestSequence = useRef(0);
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('');
  const [form, setForm] = useState({ tableId: '', guestName: '', partySize: '', date: '', shift: 'JANTAR' as 'ALMOCO' | 'JANTAR', time: '' });
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const day = businessToday();
  const headers = { 'X-Organization-Id': organizationId };

  useEffect(() => {
    if (guestSearch.trim() === appliedSearch) return;
    const timer = window.setTimeout(() => { setBookingPage(1); setAppliedSearch(guestSearch.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [guestSearch, appliedSearch]);
  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(bookingPage), limit: '20' });
    if (appliedSearch) params.set('search', appliedSearch);
    if (statusFilter) params.set('status', statusFilter);
    const options = { headers: { 'X-Organization-Id': organizationId } };
    const [tableData, bookingData, movementData] = await Promise.all([
      request<{ tables: Table[]; pagination: Pagination }>(`/restaurant/tables?page=${tablePage}&limit=20`, options),
      request<{ reservations: Booking[]; pagination: Pagination }>(`/restaurant/reservations?${params}`, options),
      request<Movement>(`/restaurant/movement?date=${day}`, options),
    ]);
    return { tableData, bookingData, movementData };
  }, [organizationId, tablePage, bookingPage, appliedSearch, statusFilter, day]);
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const loadCurrent = useCallback(async () => {
    const id = ++requestSequence.current;
    let rebasing = false;
    setLoading(true); setError('');
    try {
      const { tableData, bookingData, movementData } = await load();
      if (id !== requestSequence.current) return;
      const lastPage = Math.max(1, bookingData.pagination.totalPages);
      if (bookingData.pagination.page > lastPage) {
        rebasing = true; setBookings([]); setBookingPage(lastPage);
        return;
      }
      setTables(tableData.tables); setTablePagination(tableData.pagination);
      setBookings(bookingData.reservations); setBookingPagination(bookingData.pagination); setMovement(movementData);
      setInitialized(true); setLoadFailed(false);
    } catch (err) {
      if (id !== requestSequence.current) return;
      setTables([]); setBookings([]); setLoadFailed(true);
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        setSelectedTable(null); setForm({ tableId: '', guestName: '', partySize: '', date: '', shift: 'JANTAR', time: '' }); setTableName(''); setTableCapacity('');
      }
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados.');
    } finally { if (!rebasing && id === requestSequence.current) setLoading(false); }
  }, [load]);
  useEffect(() => { void loadCurrent(); return () => { requestSequence.current += 1; }; }, [loadCurrent, loadVersion]);
  const accessDenied = useCallback((err: ApiRequestError) => {
    requestSequence.current += 1; setTables([]); setBookings([]); setSelectedTable(null);
    setForm({ tableId: '', guestName: '', partySize: '', date: '', shift: 'JANTAR', time: '' }); setTableName(''); setTableCapacity('');
    setLoading(false); setLoadFailed(true); setError(err.message);
  }, []);
  const fail = (err: unknown, fallback: string) => {
    if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) accessDenied(err);
    else setError(err instanceof Error ? err.message : fallback);
  };
  const refreshAfterSave = async () => {
    const id = ++requestSequence.current;
    let rebasing = false;
    setLoading(true);
    try {
      const { tableData, bookingData, movementData } = await latestLoad.current();
      if (id !== requestSequence.current) return;
      const lastPage = Math.max(1, bookingData.pagination.totalPages);
      if (bookingData.pagination.page > lastPage) {
        rebasing = true; setBookings([]); setBookingPage(lastPage);
        return;
      }
      setTables(tableData.tables); setTablePagination(tableData.pagination);
      setBookings(bookingData.reservations); setBookingPagination(bookingData.pagination); setMovement(movementData);
    } catch (err) {
      if (id !== requestSequence.current) return;
      setTables([]); setBookings([]); setLoadFailed(true);
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        setSelectedTable(null); setForm({ tableId: '', guestName: '', partySize: '', date: '', shift: 'JANTAR', time: '' }); setTableName(''); setTableCapacity('');
      }
      setError(err instanceof ApiRequestError && (err.status === 401 || err.status === 403)
        ? err.message : 'Operação concluída, mas não foi possível atualizar a lista. Recarregue antes de repetir.');
    } finally { if (!rebasing && id === requestSequence.current) setLoading(false); }
  };
  const addTable = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request('/restaurant/tables', { method: 'POST', headers, body: JSON.stringify({ name: tableName.trim(), capacity: Number(tableCapacity) }) });
      setTableName(''); setTableCapacity(''); await refreshAfterSave();
    } catch (err) { fail(err, 'Não foi possível cadastrar a mesa.'); }
    finally { setBusy(false); }
  };
  const addBooking = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request('/restaurant/reservations', { method: 'POST', headers, body: JSON.stringify({ ...form, guestName: form.guestName.trim(), partySize: Number(form.partySize) }) });
      setForm({ tableId: '', guestName: '', partySize: '', date: '', shift: 'JANTAR', time: '' }); setSelectedTable(null); await refreshAfterSave();
    } catch (err) { fail(err, 'Não foi possível registrar a reserva.'); }
    finally { setBusy(false); }
  };
  const cancel = async (id: string) => {
    setBusy(true); setError('');
    try { await request(`/restaurant/reservations/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers }); setPendingCancel(null); await refreshAfterSave(); }
    catch (err) { fail(err, 'Não foi possível cancelar a reserva.'); }
    finally { setBusy(false); }
  };
  const mark = async (id: string, action: 'arrive' | 'no-show') => {
    setBusy(true); setError('');
    try { await request(`/restaurant/reservations/${encodeURIComponent(id)}/${action}`, { method: 'POST', headers }); await refreshAfterSave(); }
    catch (err) { fail(err, 'Não foi possível atualizar a reserva.'); }
    finally { setBusy(false); }
  };
  const dateLabel = (date: string) => date.slice(0, 10).split('-').reverse().join('/');
  const { expected, arrived, overdue } = movement;
  const tableOptions = selectedTable && !tables.some(table => table.id === selectedTable.id) ? [selectedTable, ...tables] : tables;

  return <div className="space-y-5">
    <h2 className="text-xl font-semibold">Mesas e reservas</h2>
    <p className="text-sm text-surface-600">Uma mesa aceita no máximo um grupo por turno. Reservas conflitantes são recusadas.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading && !initialized ? <p role="status">Carregando reservas...</p> : loadFailed ? <Button disabled={loading} onClick={() => setLoadVersion(v => v + 1)}>{loading ? 'Carregando...' : 'Tentar carregar novamente'}</Button> : <>
      <section className="card p-4 space-y-1" aria-label="Movimento de hoje"><h3 className="font-semibold">Movimento de hoje</h3>{loading ? <p>Atualizando movimento...</p> : <><p>{expected} {expected === 1 ? 'grupo esperado' : 'grupos esperados'} · {arrived} {arrived === 1 ? 'grupo presente' : 'grupos presentes'}</p>{overdue > 0 && <p className="text-amber-700">Pendências anteriores: {overdue} {overdue === 1 ? 'reserva' : 'reservas'} sem chegada ou ausência registrada. Confira e atualize.</p>}</>}</section>
      <form className="card p-4 space-y-3" onSubmit={addTable}>
        <Field id="table-name" label="Nome da mesa" required><input id="table-name" className="input" value={tableName} onChange={e => setTableName(e.target.value)} required maxLength={100} /></Field>
        <Field id="table-capacity" label="Capacidade (lugares)" required><input id="table-capacity" className="input" type="number" min={1} max={50} value={tableCapacity} onChange={e => setTableCapacity(e.target.value)} required /></Field>
        <Button type="submit" variant="primary" disabled={busy || loading}>Cadastrar mesa</Button>
      </form>
      <form className="card p-4 space-y-3" onSubmit={addBooking}>
        <h3 className="font-semibold">Nova reserva</h3>
        <Field id="booking-table" label="Mesa" required><select id="booking-table" className="input" required disabled={loading} value={form.tableId} onChange={e => { setSelectedTable(tableOptions.find(table => table.id === e.target.value) || null); setForm({ ...form, tableId: e.target.value }); }}><option value="">Selecione</option>{tableOptions.map(table => <option key={table.id} value={table.id}>{table.name} · até {table.capacity}</option>)}</select></Field>
        {tablePagination.totalPages > 1 && <div className="flex items-center gap-2"><Button small disabled={tablePage <= 1 || busy || loading} onClick={() => setTablePage(tablePage - 1)}>Mesas anteriores</Button><span>Página {tablePage} de {tablePagination.totalPages}</span><Button small disabled={tablePage >= tablePagination.totalPages || busy || loading} onClick={() => setTablePage(tablePage + 1)}>Próximas mesas</Button></div>}
        <Field id="booking-guest" label="Hóspede" required><input id="booking-guest" className="input" required maxLength={150} value={form.guestName} onChange={e => setForm({ ...form, guestName: e.target.value })} /></Field>
        <Field id="booking-party" label="Tamanho do grupo" required><input id="booking-party" className="input" type="number" min={1} max={50} required value={form.partySize} onChange={e => setForm({ ...form, partySize: e.target.value })} /></Field>
        <Field id="booking-date" label="Data" required><input id="booking-date" className="input" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field id="booking-shift" label="Turno" required><select id="booking-shift" className="input" required value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value as 'ALMOCO' | 'JANTAR' })}><option value="ALMOCO">Almoço</option><option value="JANTAR">Jantar</option></select></Field>
        <Field id="booking-time" label="Horário" required><input id="booking-time" className="input" type="time" required value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></Field>
        <Button type="submit" variant="primary" disabled={busy || loading || !tableOptions.length}>Registrar reserva</Button>
      </form>
      <section className="space-y-3"><h3 className="font-semibold">Reservas registradas</h3>
        {<div className="flex flex-wrap gap-3"><Field id="booking-search" label="Buscar hóspede"><input id="booking-search" type="search" className="input" value={guestSearch} maxLength={150} onChange={event => setGuestSearch(event.target.value)} /></Field><Field id="booking-status" label="Situação da reserva"><select id="booking-status" className="input" value={statusFilter} onChange={event => { setBookingPage(1); setStatusFilter(event.target.value); }}><option value="">Todas</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>}
        {loading || guestSearch.trim() !== appliedSearch ? <p role="status">Buscando reservas...</p> : !bookings.length && <p>{appliedSearch || statusFilter ? 'Nenhuma reserva encontrada com esses filtros.' : 'Nenhuma reserva registrada.'}</p>}
        {!loading && guestSearch.trim() === appliedSearch && bookings.map(booking => <article key={booking.id} className="card p-4 space-y-2"><strong>{booking.guestName}</strong><p>{booking.table.name} · {dateLabel(booking.date)} · {shiftLabel[booking.shift]} às {booking.time} · {booking.partySize} {booking.partySize === 1 ? 'pessoa' : 'pessoas'}</p><p>{statusLabel[booking.status] || booking.status}</p>{booking.status === 'CONFIRMED' && <div className="flex flex-wrap gap-2"><Button small disabled={busy} onClick={() => void mark(booking.id, 'arrive')}>Registrar chegada</Button><Button small disabled={busy} onClick={() => void mark(booking.id, 'no-show')}>Registrar ausência</Button>{pendingCancel === booking.id ? <><span>Cancelar esta reserva?</span><Button small disabled={busy} onClick={() => setPendingCancel(null)}>Voltar</Button><Button small variant="danger" disabled={busy} onClick={() => void cancel(booking.id)}>Confirmar cancelamento</Button></> : <Button small disabled={busy} onClick={() => setPendingCancel(booking.id)}>Cancelar reserva</Button>}</div>}</article>)}
        {!loading && bookingPagination.totalPages > 1 && <div className="flex items-center gap-3"><Button small disabled={bookingPage <= 1 || busy} onClick={() => setBookingPage(bookingPage - 1)}>Reservas anteriores</Button><span>Página {bookingPage} de {bookingPagination.totalPages}</span><Button small disabled={bookingPage >= bookingPagination.totalPages || busy} onClick={() => setBookingPage(bookingPage + 1)}>Próximas reservas</Button></div>}
      </section>
    </>}
  </div>;
}
