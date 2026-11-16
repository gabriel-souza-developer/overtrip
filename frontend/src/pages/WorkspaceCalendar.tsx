import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError, request } from '../api';
import Field from '../components/Field';
import Button from '../components/Button';

type OccupancyUnit = { id: string; name: string; occupiedNights: string[]; blockedNights?: string[] };
type Pagination = { page: number; totalPages: number; total: number };
export const businessToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}`;
};
const addDays = (date: string, days: number) => {
  const instant = new Date(`${date}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
};

export default function WorkspaceCalendar({ organizationId, version, onAccessDenied }: { organizationId: string; version: number; onAccessDenied: (error: ApiRequestError) => void }) {
  const [start, setStart] = useState(businessToday);
  const [page, setPage] = useState(1);
  const [units, setUnits] = useState<OccupancyUnit[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  const days = useMemo(() => start ? Array.from({ length: 14 }, (_, index) => addDays(start, index)) : [], [start]);
  const load = useCallback(async (requestId: number) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ start, end: addDays(start, 14), page: String(page), limit: '20' });
      const result = await request<{ units: OccupancyUnit[]; pagination: Pagination }>(`/lodging/occupancy?${params}`, { headers: { 'X-Organization-Id': organizationId } });
      if (requestId !== sequence.current) return;
      setUnits(result.units); setPagination(result.pagination);
    } catch (err) {
      if (requestId !== sequence.current) return;
      setUnits([]);
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) onAccessDenied(err);
      else setError(err instanceof Error ? err.message : 'Não foi possível carregar a ocupação.');
    } finally { if (requestId === sequence.current) setLoading(false); }
  }, [start, page, organizationId, onAccessDenied]);
  useEffect(() => {
    const id = ++sequence.current;
    if (start) void load(id); else { setUnits([]); setLoading(false); }
    return () => { sequence.current += 1; };
  }, [load, start, version, retry]);
  return <section className="card p-4 space-y-3" aria-labelledby="occupancy-title">
    <h3 id="occupancy-title" className="font-semibold">Ocupação por noite</h3>
    <p className="text-sm text-surface-600">A saída não ocupa a noite desse dia. A grade considera reservas e bloqueios deste sistema, não outros canais.</p>
    <Field id="occupancy-start" label="A partir de"><input id="occupancy-start" type="date" className="input" value={start} onChange={event => { setStart(event.target.value); setPage(1); }} /></Field>
    <div className="flex flex-wrap gap-2"><Button small disabled={!start} onClick={() => { setStart(addDays(start, -14)); setPage(1); }}>14 noites anteriores</Button><Button small onClick={() => { setStart(businessToday()); setPage(1); }}>Hoje</Button><Button small disabled={!start} onClick={() => { setStart(addDays(start, 14)); setPage(1); }}>Próximas 14 noites</Button></div>
    {loading ? <p role="status">Carregando ocupação...</p> : error ? <div role="alert"><p>{error}</p><Button small onClick={() => setRetry(value => value + 1)}>Tentar carregar ocupação novamente</Button></div> : start && !units.length && pagination.total === 0 ? <p className="text-sm">Cadastre uma unidade para consultar a ocupação.</p> : start && units.length > 0 && <><div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse"><caption className="sr-only">Disponibilidade de unidades nas próximas 14 noites</caption>
        <thead><tr><th scope="col" className="p-2 text-left">Unidade</th>{days.map(day => <th scope="col" key={day} className="p-2 whitespace-nowrap">{day.slice(8, 10)}/{day.slice(5, 7)}</th>)}</tr></thead>
        <tbody>{units.map(unit => <tr key={unit.id}><th scope="row" className="p-2 text-left whitespace-nowrap">{unit.name}</th>{days.map(day => {
          const blocked = unit.blockedNights?.includes(day) ?? false;
          const occupied = unit.occupiedNights.includes(day);
          return <td key={day} className="p-2 text-center"><span className={blocked ? 'text-amber-700' : occupied ? 'text-red-700' : 'text-green-700'}>{blocked ? 'Bloqueada' : occupied ? 'Ocupada' : 'Sem reserva'}</span></td>;
        })}</tr>)}</tbody>
      </table>
    </div>{pagination.totalPages > 1 && <div className="flex items-center gap-3"><Button small disabled={page <= 1} onClick={() => setPage(page - 1)}>Unidades anteriores na grade</Button><span>Página {page} de {pagination.totalPages}</span><Button small disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Próximas unidades na grade</Button></div>}</>}
  </section>;
}
