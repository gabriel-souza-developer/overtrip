import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, request } from '../api';
import { formatIsoDayBR } from '../lib/dateInput';
import Button from '../components/Button';
import Field from '../components/Field';

type Unit = { id: string; name: string };
type Block = { id: string; unitId: string; start: string; end: string; reason: string | null; status: string; unit: Unit };
type Pagination = { page: number; totalPages: number; total: number };
const emptyPagination: Pagination = { page: 1, totalPages: 0, total: 0 };
const labelDate = formatIsoDayBR;

/** Bloqueios usam a mesma ocupação das reservas; o servidor decide conflitos. */
export default function WorkspaceBlocks({ organizationId, version: externalVersion = 0, onAccessDenied, onChanged }: {
  organizationId: string;
  version?: number;
  onAccessDenied: (error: ApiRequestError) => void;
  onChanged: () => void;
}) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [unitPage, setUnitPage] = useState(1);
  const [blockPage, setBlockPage] = useState(1);
  const [unitPagination, setUnitPagination] = useState<Pagination>(emptyPagination);
  const [blockPagination, setBlockPagination] = useState<Pagination>(emptyPagination);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [form, setForm] = useState({ unitId: '', start: '', end: '', reason: '' });
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const sequence = useRef(0);
  const awaitingRefreshAfterSave = useRef(false);

  const clearPrivateState = useCallback(() => {
    setUnits([]); setBlocks([]); setSelectedUnit(null);
    setForm({ unitId: '', start: '', end: '', reason: '' });
    setPendingCancel(null);
  }, []);

  const load = useCallback(async (id: number) => {
    setLoading(true); setError('');
    try {
      const options = { headers: { 'X-Organization-Id': organizationId } };
      const [unitResult, blockResult] = await Promise.all([
        request<{ units: Unit[]; pagination: Pagination }>(`/lodging/units?page=${unitPage}&limit=20`, options),
        request<{ blocks: Block[]; pagination: Pagination }>(`/lodging/blocks?page=${blockPage}&limit=20`, options),
      ]);
      if (id !== sequence.current) return;
      const lastPage = Math.max(1, blockResult.pagination.totalPages);
      if (blockPage > lastPage) { setBlockPage(lastPage); return; }
      setUnits(unitResult.units); setUnitPagination(unitResult.pagination);
      setBlocks(blockResult.blocks); setBlockPagination(blockResult.pagination);
      awaitingRefreshAfterSave.current = false;
      setFailed(false); setInitialized(true);
    } catch (err) {
      if (id !== sequence.current) return;
      clearPrivateState(); setFailed(true);
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) onAccessDenied(err);
      else setError(awaitingRefreshAfterSave.current
        ? 'Operação concluída, mas não foi possível atualizar os bloqueios. Recarregue antes de repetir.'
        : err instanceof Error ? err.message : 'Não foi possível carregar os bloqueios.');
    } finally { if (id === sequence.current) setLoading(false); }
  }, [organizationId, unitPage, blockPage, onAccessDenied, clearPrivateState]);

  useEffect(() => {
    const id = ++sequence.current;
    void load(id);
    return () => { sequence.current += 1; };
  }, [load, version, externalVersion]);

  const handleFailure = (err: unknown, fallback: string) => {
    if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
      sequence.current += 1; clearPrivateState(); setFailed(true); onAccessDenied(err);
    } else setError(err instanceof Error ? err.message : fallback);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!form.unitId || !form.start || !form.end || form.start >= form.end) {
      setError('Selecione a unidade e informe uma saída posterior à entrada.'); return;
    }
    setBusy(true);
    try {
      await request('/lodging/blocks', { method: 'POST', headers: { 'X-Organization-Id': organizationId }, body: JSON.stringify({ ...form, reason: form.reason.trim() || null }) });
      setForm({ unitId: '', start: '', end: '', reason: '' }); setSelectedUnit(null);
      awaitingRefreshAfterSave.current = true; onChanged(); setVersion(value => value + 1);
    } catch (err) { handleFailure(err, 'Não foi possível registrar o bloqueio.'); }
    finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    setError(''); setBusy(true);
    try {
      await request(`/lodging/blocks/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { 'X-Organization-Id': organizationId } });
      setPendingCancel(null); awaitingRefreshAfterSave.current = true; onChanged(); setVersion(value => value + 1);
    } catch (err) { handleFailure(err, 'Não foi possível cancelar o bloqueio.'); }
    finally { setBusy(false); }
  };
  const unitOptions = selectedUnit && !units.some(unit => unit.id === selectedUnit.id) ? [selectedUnit, ...units] : units;

  return <section className="lodging-blocks card p-5 space-y-4" aria-labelledby="blocks-title">
    <div className="lodging-section-heading"><div><span className="lodging-eyebrow">INDISPONIBILIDADE</span><h2 id="blocks-title">Bloqueios de unidades</h2><p>Organize períodos de manutenção e indisponibilidade.</p></div></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading && !initialized ? <p role="status">Carregando bloqueios...</p> : failed ? <Button disabled={loading} onClick={() => setVersion(value => value + 1)}>{loading ? 'Carregando...' : 'Tentar carregar bloqueios novamente'}</Button> : <>
      <details className="lodging-disclosure"><summary>Novo bloqueio</summary><p className="text-sm text-surface-600 mt-3">O último dia fica livre. O sistema recusa conflitos com reservas e outros bloqueios.</p><form className="space-y-3 mt-4" onSubmit={event => void create(event)}>
        <Field id="block-unit" label="Unidade do bloqueio" required><select id="block-unit" className="input" required disabled={busy || loading} value={form.unitId} onChange={event => { const id = event.target.value; setSelectedUnit(unitOptions.find(unit => unit.id === id) || null); setForm({ ...form, unitId: id }); }}><option value="">Selecione</option>{unitOptions.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
        {unitPagination.totalPages > 1 && <div className="flex flex-wrap items-center gap-2"><Button small disabled={busy || loading || unitPage <= 1} onClick={() => setUnitPage(page => page - 1)}>Unidades anteriores para bloqueio</Button><span>Página {unitPage} de {unitPagination.totalPages}</span><Button small disabled={busy || loading || unitPage >= unitPagination.totalPages} onClick={() => setUnitPage(page => page + 1)}>Próximas unidades para bloqueio</Button></div>}
        <Field id="block-start" label="Primeiro dia bloqueado" required><input id="block-start" className="input" type="date" required value={form.start} onChange={event => setForm({ ...form, start: event.target.value })} /></Field>
        <Field id="block-end" label="Liberar a partir de" required hint="Esse dia já fica disponível para nova reserva."><input id="block-end" className="input" type="date" required min={form.start || undefined} value={form.end} onChange={event => setForm({ ...form, end: event.target.value })} /></Field>
        <Field id="block-reason" label="Motivo"><input id="block-reason" className="input" maxLength={200} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></Field>
        <Button type="submit" variant="primary" disabled={busy || loading || !unitOptions.length}>Registrar bloqueio</Button>
      </form></details>
      <div className="space-y-3"><h3 className="font-semibold">Bloqueios registrados</h3>
        {loading ? <p role="status">Atualizando bloqueios...</p> : !blocks.length ? <p>Nenhum bloqueio registrado.</p> : blocks.map(block => <article key={block.id} className="card p-4 space-y-2"><strong>{block.unit.name}</strong><p>{labelDate(block.start)} a {labelDate(block.end)} · {block.status === 'CANCELLED' ? 'Cancelado' : 'Ativo'}</p>{block.reason && <p className="whitespace-pre-wrap">{block.reason}</p>}{block.status === 'ACTIVE' && (pendingCancel === block.id ? <div className="flex flex-wrap items-center gap-2"><span>Cancelar este bloqueio?</span><Button small disabled={busy} onClick={() => setPendingCancel(null)}>Voltar</Button><Button small variant="danger" disabled={busy} onClick={() => void cancel(block.id)}>Confirmar cancelamento do bloqueio</Button></div> : <Button small disabled={busy} onClick={() => setPendingCancel(block.id)}>Cancelar bloqueio</Button>)}</article>)}
        {!loading && blockPagination.totalPages > 1 && <div className="flex flex-wrap items-center gap-2"><Button small disabled={busy || blockPage <= 1} onClick={() => setBlockPage(page => page - 1)}>Bloqueios anteriores</Button><span>Página {blockPage} de {blockPagination.totalPages}</span><Button small disabled={busy || blockPage >= blockPagination.totalPages} onClick={() => setBlockPage(page => page + 1)}>Próximos bloqueios</Button></div>}
      </div>
    </>}
  </section>;
}
