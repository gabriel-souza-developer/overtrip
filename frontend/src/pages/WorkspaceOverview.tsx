import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Clock3 } from 'lucide-react';
import { request } from '../api';
import { businessToday } from './WorkspaceCalendar';
import './workspace-overview.css';

type Movement = { arrivals?: number; departures?: number; overdueArrivals?: number; overdueDepartures?: number; expected?: number; arrived?: number; overdue?: number };
type Reservation = { id: string; guestName: string; checkIn?: string; date?: string; status: string; unit?: { name: string }; table?: { name: string } };

/** Indicadores vêm do servidor e sempre pertencem à empresa selecionada. */
export default function WorkspaceOverview({ organizationId, niche, onOpen }: { organizationId: string; niche: string; onOpen: () => void }) {
  const [movement, setMovement] = useState<Movement | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const lodging = niche === 'pousada';
  const supported = lodging || niche === 'restaurante';
  useEffect(() => {
    let active = true;
    setMovement(null); setReservations([]); setError('');
    if (!supported) return () => { active = false; };
    const module = lodging ? 'lodging' : 'restaurant';
    const options = { headers: { 'X-Organization-Id': organizationId } };
    Promise.all([request<Movement>(`/${module}/movement?date=${businessToday()}`, options), request<{ reservations: Reservation[] }>(`/${module}/reservations?page=1&limit=5`, options)])
      .then(([value, list]) => { if (active) { setMovement(value); setReservations(list.reservations); } })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar os indicadores.'); });
    return () => { active = false; };
  }, [organizationId, lodging, supported, version]);
  const cards = lodging ? [
    { label: 'Chegadas previstas', value: movement?.arrivals, note: 'Para hoje', icon: ArrowDownLeft },
    { label: 'Saídas previstas', value: movement?.departures, note: 'Para hoje', icon: ArrowUpRight },
    { label: 'Chegadas pendentes', value: movement?.overdueArrivals, note: 'De dias anteriores', icon: Clock3 },
    { label: 'Saídas pendentes', value: movement?.overdueDepartures, note: 'De dias anteriores', icon: CalendarDays },
  ] : [
    { label: 'Reservas esperadas', value: movement?.expected, note: 'Para hoje', icon: CalendarDays },
    { label: 'Grupos presentes', value: movement?.arrived, note: 'Registrados hoje', icon: ArrowDownLeft },
    { label: 'Reservas pendentes', value: movement?.overdue, note: 'De dias anteriores', icon: Clock3 },
  ];
  return <div className="workspace-overview">
    <div className="workspace-overview-head"><div><p className="workspace-overview-kicker">ACOMPANHAMENTO DO NEGÓCIO</p><h1>Visão geral</h1><p>{lodging ? 'Acompanhe chegadas, saídas e reservas.' : 'Acompanhe reservas e mesas do dia.'}</p></div><button type="button" className="workspace-overview-action" onClick={onOpen}>Abrir operação <span aria-hidden="true">↗</span></button></div>
    {supported ? <><div className="workspace-overview-section"><h2>Movimento de hoje</h2><p>Dados da empresa selecionada.</p></div>
      {error ? <div role="alert" className="workspace-overview-error"><p>Não foi possível carregar o movimento: {error}</p><button type="button" onClick={() => setVersion(value => value + 1)}>Tentar novamente</button></div> : <div className="workspace-overview-cards" aria-busy={!movement}>{cards.map(({ label, value, note, icon: Icon }) => <article key={label}><div><span>{label}</span><span className="workspace-overview-icon"><Icon size={18} aria-hidden="true" /></span></div><strong>{movement ? value ?? 0 : '—'}</strong><small>{movement ? note : 'Carregando...'}</small></article>)}</div>}
      {!error && <section className="workspace-overview-list"><div className="workspace-overview-list-head"><div><p className="workspace-overview-kicker">RESERVAS</p><h2>Reservas registradas</h2><p>Consulte a agenda completa na operação.</p></div><button type="button" onClick={onOpen}>Ver operação →</button></div>{!movement ? <p className="workspace-overview-list-empty">Carregando reservas...</p> : reservations.length ? <ul>{reservations.map(item => <li key={item.id}><span className="workspace-overview-date">{(item.checkIn || item.date || '').slice(0, 10).split('-').reverse().slice(0, 2).join('/')}</span><span className="workspace-overview-guest"><strong>{item.guestName}</strong><small>{item.unit?.name || item.table?.name || '—'}</small></span><span className="workspace-overview-status">{({ CONFIRMED: 'Confirmada', CHECKED_IN: 'Presente', CHECKED_OUT: 'Encerrada', ARRIVED: 'Presente', NO_SHOW: 'Ausência', CANCELLED: 'Cancelada' } as Record<string, string>)[item.status] || item.status}</span></li>)}</ul> : <p className="workspace-overview-list-empty">Nenhuma reserva registrada.</p>}</section>}
      <section className="workspace-overview-next"><div><span className="workspace-overview-icon"><CalendarDays size={20} aria-hidden="true" /></span><div><h2>Agenda e reservas</h2><p>{lodging ? 'Consulte a ocupação, registre reservas e acompanhe as estadias.' : 'Organize as mesas, registre reservas e acompanhe as chegadas.'}</p></div></div><button type="button" onClick={onOpen}>Ir para operação <span aria-hidden="true">→</span></button></section></> : <p>Este espaço ainda não tem módulos operacionais disponíveis.</p>}
  </div>;
}
