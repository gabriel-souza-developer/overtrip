import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Minus, Percent, TrendingDown, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { financeApi, type FinanceSummary, type FinanceTotals } from '../api/finance';
import { request } from '../api';
import { destinationApi, type Destination, type OutingInput } from '../api/destinations';
import { emptyOutingForm, formToOutingInput, outingToForm, previewOuting } from '../lib/destinationBank';
import { MISSING_LABELS, MONTHS_SHORT, compactMoney, money, niceScale, percentChange, pointsChange } from '../lib/finance';
import { formatDateBR } from '../lib/dateInput';
import PageHeader from '../components/PageHeader';
import ErrorState from '../components/ErrorState';
import Modal from '../components/Modal';
import Field from '../components/Field';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Cores das barras (validadas no verificador de paleta: laranja da marca para
// resultado positivo, azul para negativo — par divergente, contraste ≥ 3:1).
const POSITIVE = '#d14800';
const NEGATIVE = '#2563a8';

type Tone = 'good' | 'bad' | 'neutral';

function Delta({ value, unit, goodWhenUp = true, caption }: { value: number | null; unit: '%' | 'p.p.'; goodWhenUp?: boolean; caption: string }) {
  if (value === null) return <p className="mt-2 text-xs text-surface-600">Sem base de comparação</p>;
  const tone: Tone = value === 0 ? 'neutral' : (value > 0) === goodWhenUp ? 'good' : 'bad';
  const Icon = value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const toneClass = { good: 'bg-emerald-50 text-emerald-800', bad: 'bg-rose-50 text-rose-800', neutral: 'bg-surface-100 text-surface-700' }[tone];
  const text = `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit === '%' ? '%' : ' p.p.'}`;
  return <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-surface-600">
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${toneClass}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{text}</span>
    {caption}
  </p>;
}

function KpiCard({ label, value, icon: Icon, children }: { label: string; value: string; icon: LucideIcon; children?: React.ReactNode }) {
  return <div className="relative overflow-hidden rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
    <Icon className="pointer-events-none absolute -right-2 -top-2 h-20 w-20 text-surface-100" aria-hidden="true" />
    <p className="relative text-xs font-semibold uppercase tracking-[0.12em] text-surface-600">{label}</p>
    <p className="relative mt-2 text-3xl font-bold tracking-tight text-surface-900 tabular-nums">{value}</p>
    <div className="relative">{children}</div>
  </div>;
}

interface Point { key: string; label: string; short?: string; valueCents: number; detail: string }

/** Barras do resultado: positivo para cima (laranja), negativo para baixo (azul), zero marcado. */
function ResultChart({ points, caption }: { points: Point[]; caption: string }) {
  const { min, max, step } = niceScale(points.map((point) => point.valueCents));
  const range = max - min;
  const pct = (value: number) => ((max - value) / range) * 100;
  const ticks: number[] = [];
  for (let value = max; value >= min - 1e-9; value -= step) ticks.push(value);
  const zero = pct(0);
  return <figure className="overflow-x-auto">
    <div className="min-w-[17rem]">
    <div className="relative ml-16 h-60" aria-hidden="true">
      {ticks.map((tick) => <div key={tick} className="absolute inset-x-0 border-t border-dashed border-surface-200" style={{ top: `${pct(tick)}%` }}>
        <span className="absolute -left-16 w-14 -translate-y-1/2 text-right text-[11px] text-surface-500 tabular-nums">{compactMoney(tick)}</span>
      </div>)}
      <div className="absolute inset-x-0 border-t border-surface-400" style={{ top: `${zero}%` }} />
      <div className="absolute inset-0 flex">
        {points.map((point) => {
          const top = point.valueCents >= 0 ? pct(point.valueCents) : zero;
          const height = Math.abs(pct(point.valueCents) - zero);
          return <div key={point.key} className="group relative flex-1 px-[2px]">
            {point.valueCents !== 0 && <div className={`absolute inset-x-[18%] ${point.valueCents >= 0 ? 'rounded-t' : 'rounded-b'}`} style={{ top: `${top}%`, height: `${Math.max(height, 0.8)}%`, background: point.valueCents >= 0 ? POSITIVE : NEGATIVE }} />}
            <div className="pointer-events-none absolute left-1/2 z-10 hidden w-max max-w-[14rem] -translate-x-1/2 rounded-lg bg-surface-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block" style={{ top: `${Math.max(0, Math.min(top, zero) - 18)}%` }}>
              <p className="font-semibold">{point.label}</p><p className="tabular-nums">Resultado {money(point.valueCents)}</p><p className="text-surface-300">{point.detail}</p>
            </div>
          </div>;
        })}
      </div>
    </div>
    <div className="ml-16 mt-2 flex text-[11px] text-surface-500" aria-hidden="true">{points.map((point) => <span key={point.key} className="flex-1 text-center">{point.short ? <><span className="sm:hidden">{point.short}</span><span className="hidden sm:inline">{point.label}</span></> : point.label}</span>)}</div>
    </div>
    <table className="sr-only"><caption>{caption}</caption><thead><tr><th scope="col">Período</th><th scope="col">Resultado</th><th scope="col">Detalhe</th></tr></thead>
      <tbody>{points.map((point) => <tr key={point.key}><th scope="row">{point.label}</th><td>{money(point.valueCents)}</td><td>{point.detail}</td></tr>)}</tbody></table>
  </figure>;
}

function RankedBars({ rows }: { rows: FinanceSummary['outings']['byDestination'] }) {
  const items = rows.filter((row) => row.completeOutings > 0).slice(0, 7);
  if (items.length === 0) return <p className="text-sm text-surface-600">Nenhuma saída com valores completos neste período.</p>;
  const largest = Math.max(...items.map((row) => Math.abs(row.resultCents)), 1);
  return <ul className="space-y-3">{items.map((row) => <li key={row.destinationId}>
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-surface-800" title={row.name}>{row.name}</span>
      <span className="shrink-0 font-semibold text-surface-900 tabular-nums">{money(row.resultCents)}</span>
    </div>
    <div className="mt-1 h-2 rounded-full bg-surface-100" aria-hidden="true">
      <div className="h-2 rounded-full" style={{ width: row.resultCents === 0 ? '0%' : `${Math.max(2, (Math.abs(row.resultCents) / largest) * 100)}%`, background: row.resultCents >= 0 ? POSITIVE : NEGATIVE }} />
    </div>
    <p className="mt-0.5 text-[11px] text-surface-500">{row.outings === 1 ? '1 saída' : `${row.outings} saídas`} · margem {row.marginPct === null ? '—' : `${row.marginPct.toLocaleString('pt-BR')}%`}</p>
  </li>)}</ul>;
}

const subline = (totals: FinanceTotals) => `${totals.completeOutings} de ${totals.outings} registros com valores · ${totals.passengers} passageiros${totals.courtesySeats ? ` (${totals.courtesySeats} cortesias)` : ''}`;

export default function Finance() {
  useDocumentTitle('Financeiro');
  const [year, setYear] = useState<number | 'all' | null>(null);
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const requestVersion = useRef(0);
  const [editing, setEditing] = useState<{ destinationId: string; outingId: string; name: string; original: OutingInput } | null>(null);
  const [editForm, setEditForm] = useState(emptyOutingForm);
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [removing, setRemoving] = useState<FinanceSummary['outings']['outings'][number] | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const result = await financeApi.summary(year);
      if (version === requestVersion.current) { setData(result); setLoadedAt(new Date()); }
    } catch (err) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'Não foi possível carregar o financeiro.');
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [year]);
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [load]);

  const openEdit = async (outing: FinanceSummary['outings']['outings'][number]) => {
    if (editLoading) return;
    setEditLoading(outing.id); setError('');
    try {
      const destination = await request<Destination>(`/destinations/${encodeURIComponent(outing.destinationId)}`);
      const record = destination.outings.find((item) => item.id === outing.id);
      if (!record) throw new Error('Saída não encontrada. Atualize o financeiro e tente novamente.');
      const form = outingToForm(record);
      const original = formToOutingInput(form).data;
      if (!original) throw new Error('Os dados desta saída precisam ser revisados no histórico.');
      setEditForm(form); setEditError('');
      setEditing({ destinationId: outing.destinationId, outingId: outing.id, name: outing.destinationName, original });
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir a saída.'); }
    finally { setEditLoading(null); }
  };
  const saveEdit = async () => {
    if (!editing || editSaving) return;
    const parsed = formToOutingInput(editForm);
    if (!parsed.data) { setEditError(parsed.error ?? 'Revise os campos.'); return; }
    const changes = Object.fromEntries(Object.entries(parsed.data).filter(([key, value]) => value !== editing.original[key as keyof OutingInput]));
    if (!Object.keys(changes).length) { setEditing(null); return; }
    setEditSaving(true); setEditError('');
    try {
      await request(`/destinations/${encodeURIComponent(editing.destinationId)}/outings/${encodeURIComponent(editing.outingId)}`, { method: 'PUT', body: JSON.stringify(changes) });
      setEditing(null);
      await load();
    } catch (err) { setEditError(err instanceof Error ? err.message : 'Não foi possível salvar a saída.'); }
    finally { setEditSaving(false); }
  };
  const parsedEdit = formToOutingInput(editForm);
  const editPreview = parsedEdit.data ? previewOuting(parsedEdit.data) : null;
  const removeOuting = async () => {
    if (!removing || removeBusy) return;
    setRemoveBusy(true);
    try {
      await destinationApi.removeOuting(removing.destinationId, removing.id);
      setRemoving(null);
      await load();
    } catch (err) { setRemoving(null); setError(err instanceof Error ? err.message : 'Não foi possível excluir a saída.'); }
    finally { setRemoveBusy(false); }
  };

  const outings = data?.outings;
  const selected = outings?.year ?? null;
  const currentYear = new Date().getFullYear();
  const previous = selected !== null ? outings?.byYear.find((row) => row.year === selected - 1) : undefined;
  const totals = outings?.totals;
  const compareCaption = previous ? `vs ${previous.year}${selected === currentYear ? ' (ano em andamento)' : ''}` : '';
  const points: Point[] = !outings ? [] : selected === null
    ? outings.byYear.map((row) => ({ key: String(row.year), label: String(row.year), valueCents: row.resultCents, detail: subline(row) }))
    : outings.byMonth.map((row) => ({ key: String(row.month), label: MONTHS_SHORT[row.month - 1], short: MONTHS_SHORT[row.month - 1].charAt(0).toUpperCase(), valueCents: row.resultCents, detail: `${row.completeOutings} de ${row.outings} saídas com valores` }));
  const reservations = data?.reservations;

  return <div className="space-y-6 pb-6">
    <PageHeader title="Financeiro" description="Estimativa das saídas e situação das reservas, a partir dos valores registrados. As duas fontes são apresentadas separadamente e não são somadas." />

    {outings && <div role="tablist" aria-label="Período" className="flex flex-wrap gap-2">
      {[...outings.years].reverse().map((option) => <button key={option} type="button" role="tab" aria-selected={selected === option} onClick={() => setYear(option)}
        className={`min-h-10 rounded-full border px-4 text-sm font-semibold tabular-nums ${selected === option ? 'border-primary-600 bg-primary-600 text-white' : 'border-surface-200 bg-white text-surface-700 hover:border-primary-300'}`}>{option}{option === currentYear ? ' · em andamento' : ''}</button>)}
      <button type="button" role="tab" aria-selected={selected === null} onClick={() => setYear('all')}
        className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${selected === null ? 'border-primary-600 bg-primary-600 text-white' : 'border-surface-200 bg-white text-surface-700 hover:border-primary-300'}`}>Todos os anos</button>
    </div>}
    {outings && <p className="text-xs text-surface-600">Saídas sem data completa aparecem somente em “Todos os anos”, inclusive as importadas com apenas mês e ano.</p>}

    {error && <ErrorState message={error} onRetry={() => void load()} />}
    {loading && !data && <p role="status" className="text-sm text-surface-600">Carregando financeiro...</p>}

    {outings && totals && <>
      <section aria-label="Indicadores do período" className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
        <KpiCard label="Receita estimada" value={totals.completeOutings ? money(totals.revenueCents) : '—'} icon={TrendingUp}>
          {selected !== null && <Delta value={totals.completeOutings && previous?.completeOutings ? percentChange(totals.revenueCents, previous.revenueCents) : null} unit="%" caption={compareCaption} />}
          <p className="mt-1 text-xs text-surface-600">Receita média por saída {money(totals.averageTicketCents)}</p>
        </KpiCard>
        <KpiCard label="Despesa" value={totals.completeOutings ? money(totals.expenseCents) : '—'} icon={TrendingDown}>
          {selected !== null && <Delta value={totals.completeOutings && previous?.completeOutings ? percentChange(totals.expenseCents, previous.expenseCents) : null} unit="%" goodWhenUp={false} caption={compareCaption} />}
          <p className="mt-1 text-xs text-surface-600">Transporte e taxas extras</p>
        </KpiCard>
        <KpiCard label="Resultado estimado" value={totals.completeOutings ? money(totals.resultCents) : '—'} icon={Wallet}>
          {selected !== null && <Delta value={totals.completeOutings && previous?.completeOutings ? percentChange(totals.resultCents, previous.resultCents) : null} unit="%" caption={compareCaption} />}
          <p className="mt-1 text-xs text-surface-600">Média por saída {money(totals.averageResultCents)}</p>
        </KpiCard>
        <KpiCard label="Margem" value={totals.marginPct === null ? '—' : `${totals.marginPct.toLocaleString('pt-BR')}%`} icon={Percent}>
          {selected !== null && <Delta value={pointsChange(totals.marginPct, previous?.marginPct)} unit="p.p." caption={compareCaption} />}
          <p className="mt-1 text-xs text-surface-600">Resultado ÷ receita</p>
        </KpiCard>
      </section>
      <p className="-mt-3 text-xs text-surface-600">{subline(totals)}.{outings.incompleteOutings > 0 && ` ${outings.incompleteOutings === 1 ? '1 saída sem' : `${outings.incompleteOutings} saídas sem`} valores completos fica${outings.incompleteOutings === 1 ? '' : 'm'} fora da receita, despesa e margem.`}</p>

      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <section aria-labelledby="finance-chart-title" className="min-w-0 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><h2 id="finance-chart-title" className="text-base font-bold text-surface-900">{selected === null ? 'Resultado por ano' : 'Resultado por mês'}</h2>
              <p className="text-xs text-surface-600">{selected === null ? 'Saídas sem data entram no total, mas não no gráfico anual.' : `Janeiro a dezembro de ${selected} · somente saídas com valores completos`}</p></div>
            <span className="rounded-lg bg-primary-50 px-2.5 py-1 text-sm font-semibold text-primary-800 tabular-nums">{totals.completeOutings ? money(totals.resultCents) : '—'}</span>
          </div>
          {points.length > 0 && (selected === null ? outings.byYear.some((row) => row.completeOutings > 0) : totals.completeOutings > 0) ? <ResultChart points={points} caption={selected === null ? 'Resultado por ano' : `Resultado por mês em ${selected}`} /> : <p className="text-sm text-surface-600">Sem saídas com data e valores completos para o gráfico.</p>}
        </section>
        <section aria-labelledby="finance-destinations-title" className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
          <h2 id="finance-destinations-title" className="text-base font-bold text-surface-900">Resultado por destino</h2>
          <p className="mb-4 text-xs text-surface-600">Maiores resultados do período</p>
          <RankedBars rows={outings.byDestination} />
        </section>
      </div>

      {reservations && <section aria-labelledby="finance-reservations-title" className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="finance-reservations-title" className="text-base font-bold text-surface-900">Reservas e parcelas</h2>
            <p className="text-xs text-surface-600">Reservas não canceladas, de todas as viagens</p></div>
          <Link to="/reservations" className="text-sm font-medium text-primary-700 hover:underline">Abrir reservas</Link>
        </div>
        {reservations.activeReservations === 0
          ? <p className="mt-3 text-sm text-surface-600">Nenhuma reserva registrada ainda. Quando houver, o contratado, o recebido e as parcelas a vencer aparecem aqui.</p>
          : <>
            <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ['Contratado', money(reservations.contractedCents), `${reservations.activeReservations === 1 ? '1 reserva' : `${reservations.activeReservations} reservas`} · ${reservations.seats === 1 ? '1 lugar' : `${reservations.seats} lugares`}`],
                ['Recebido', money(reservations.receivedCents), 'Parcelas marcadas como pagas'],
                ['A receber', money(reservations.receivableCents), 'Contratado − recebido'],
                ['Vencido', money(reservations.overdueCents), reservations.overdueInstallments === 1 ? '1 parcela em atraso' : `${reservations.overdueInstallments} parcelas em atraso`],
                ['Próximos 30 dias', money(reservations.dueNext30DaysCents), 'Parcelas a vencer'],
              ].map(([label, value, hint]) => <div key={label} className="rounded-xl bg-surface-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-surface-600">{label}</dt>
                <dd className="mt-1 text-xl font-bold text-surface-900 tabular-nums">{value}</dd>
                <dd className="text-[11px] text-surface-500">{hint}</dd>
              </div>)}
            </dl>
            {reservations.pendingInstallments.length > 0 && <div className="mt-4">
              <h3 className="text-sm font-semibold text-surface-900">Parcelas vencidas e a vencer</h3>
              <p className="text-xs text-surface-600">Até 20 parcelas, ordenadas pelo vencimento. Consulte Reservas para ver todas.</p>
              <ul className="mt-2 divide-y divide-surface-200">{reservations.pendingInstallments.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0"><span className="font-medium text-surface-900">{item.customerName}</span><span className="block text-xs text-surface-600">{item.tripTitle}</span></span>
                <span className="flex items-center gap-3">
                  {item.overdue
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-800"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Vencida em {formatDateBR(item.dueDate)}</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-surface-700"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />Vence em {formatDateBR(item.dueDate)}</span>}
                  <span className="font-semibold tabular-nums text-surface-900">{money(item.amountCents)}</span>
                </span>
              </li>)}</ul>
            </div>}
          </>}
      </section>}

      <section aria-labelledby="finance-outings-title" className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="finance-outings-title" className="text-base font-bold text-surface-900">Saídas {selected === null ? 'registradas' : `de ${selected}`}</h2>
            <p className="text-xs text-surface-600">Edite uma saída para completar valores. Registros criados pelo site precisam de revisão: pontos no mesmo dia podem ser da mesma viagem.</p></div>
          <Link to="/destination-history" className="text-sm font-medium text-primary-700 hover:underline">Abrir histórico de saídas</Link>
        </div>
        {outings.outings.length === 0 ? <p className="mt-3 text-sm text-surface-600">Nenhuma saída no período.</p> : <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Saídas do período com receita, despesa e resultado</caption>
            <thead className="text-xs uppercase text-surface-600"><tr>
              <th scope="col" className="py-2 pr-3">Data</th><th scope="col" className="py-2 pr-3">Destino</th><th scope="col" className="py-2 pr-3 text-right">Pessoas</th>
              <th scope="col" className="py-2 pr-3 text-right">Por pessoa</th><th scope="col" className="py-2 pr-3 text-right">Receita</th><th scope="col" className="py-2 pr-3 text-right">Despesa</th><th scope="col" className="py-2 text-right">Resultado</th><th scope="col"><span className="sr-only">Ações</span></th>
            </tr></thead>
            <tbody className="divide-y divide-surface-200">{outings.outings.map((outing) => <tr key={outing.id}>
              <td className="py-2 pr-3 whitespace-nowrap">{outing.date ? formatDateBR(outing.date) : 'Sem data'}</td>
              <td className="py-2 pr-3"><span className="text-surface-900">{outing.destinationName}</span>
                {outing.siteImported && <span className="block text-xs text-surface-600">Criado a partir do site · conferir realização</span>}
                {outing.missing.length > 0 && <span className="block text-xs text-amber-800">Falta: {outing.missing.map((field) => MISSING_LABELS[field]).join(', ')}</span>}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{outing.passengers ?? '—'}{outing.courtesySeats ? <span className="block text-[11px] text-surface-500">{outing.courtesySeats} cortesia{outing.courtesySeats > 1 ? 's' : ''}</span> : null}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(outing.pricePerPersonCents)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(outing.revenueCents)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(outing.expenseCents)}</td>
              <td className={`py-2 text-right font-semibold tabular-nums ${outing.resultCents !== null && outing.resultCents < 0 ? 'text-rose-800' : 'text-surface-900'}`}>{money(outing.resultCents)}</td>
              <td className="py-2 pl-3"><div className="flex gap-3"><button type="button" className="text-sm font-medium text-primary-700 hover:underline" disabled={editLoading !== null} onClick={() => void openEdit(outing)} aria-label={`Editar saída de ${outing.destinationName}, ${outing.date ? formatDateBR(outing.date) : 'sem data'}`}>{editLoading === outing.id ? 'Abrindo...' : 'Editar'}</button><button type="button" className="text-sm font-medium text-red-700 hover:underline" onClick={() => setRemoving(outing)} aria-label={`Excluir saída de ${outing.destinationName}, ${outing.date ? formatDateBR(outing.date) : 'sem data'}`}>Excluir</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>

      <footer className="flex flex-wrap justify-between gap-2 border-t border-surface-200 pt-3 text-xs text-surface-500">
        <span>Receita = (passageiros − cortesias) × valor por pessoa. Despesa = transporte + taxas extras.</span>
        {loadedAt && <span>Atualizado em {loadedAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
      </footer>
    </>}
    <Modal open={editing !== null} onOpenChange={(open) => { if (!open && !editSaving) setEditing(null); }} title="Editar saída" description={editing?.name} widthClass="max-w-xl"
      footer={<><Button onClick={() => setEditing(null)} disabled={editSaving}>Cancelar</Button><Button variant="primary" loading={editSaving} loadingText="Salvando..." onClick={() => void saveEdit()}>Salvar</Button></>}>
      <form onSubmit={(event) => { event.preventDefault(); void saveEdit(); }} className="space-y-4" noValidate>
        {editError && <div className="alert-error" role="alert">{editError}</div>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="finance-edit-date" label="Data"><input id="finance-edit-date" type="date" className="input" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} /></Field>
          <Field id="finance-edit-passengers" label="Passageiros"><input id="finance-edit-passengers" inputMode="numeric" className="input" value={editForm.passengers} onChange={(e) => setEditForm({ ...editForm, passengers: e.target.value })} /></Field>
          <Field id="finance-edit-courtesy" label="Cortesias" hint="Lugares que não pagam."><input id="finance-edit-courtesy" inputMode="numeric" className="input" value={editForm.courtesySeats} onChange={(e) => setEditForm({ ...editForm, courtesySeats: e.target.value })} /></Field>
          <Field id="finance-edit-price" label="Valor por pessoa (R$)"><input id="finance-edit-price" inputMode="decimal" className="input" value={editForm.pricePerPerson} onChange={(e) => setEditForm({ ...editForm, pricePerPerson: e.target.value })} /></Field>
          <Field id="finance-edit-transport" label="Transporte (R$)"><input id="finance-edit-transport" inputMode="decimal" className="input" value={editForm.transportCost} onChange={(e) => setEditForm({ ...editForm, transportCost: e.target.value })} /></Field>
          <Field id="finance-edit-extra" label="Taxas extras (R$)" hint="Entradas, guia, estacionamento."><input id="finance-edit-extra" inputMode="decimal" className="input" value={editForm.extraCost} onChange={(e) => setEditForm({ ...editForm, extraCost: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-surface-600">Cortesias em branco contam como zero. Quando apenas um custo é informado, o outro é considerado zero.</p>
        {editPreview && <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-50 p-3 text-sm" aria-live="polite">
          <div><dt>Receita estimada</dt><dd className="font-semibold">{money(editPreview.revenueCents)}</dd></div>
          <div><dt>Despesa</dt><dd className="font-semibold">{money(editPreview.expenseCents)}</dd></div>
          <div><dt>Resultado</dt><dd className="font-semibold">{money(editPreview.resultCents)}</dd></div>
        </dl>}
      </form>
    </Modal>
    <ConfirmDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }} title="Excluir esta saída?"
      description={`A saída de ${removing?.destinationName ?? ''} será removida do histórico e dos totais. O destino permanece. Se ela veio do site, uma nova sincronização pode recriá-la.`}
      confirmLabel="Excluir saída" busyLabel="Excluindo..." busy={removeBusy} onConfirm={() => void removeOuting()} />
  </div>;
}
