import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import { systemApi } from '../api';
import { healthChartPoints, healthSummary, type HealthChartPoint, type SystemHealth, type SystemHealthHistoryPoint } from '../lib/systemHealth';

const chartSeries = [
  { key: 'diskUsed', label: 'Disco usado', color: '#e26b1b' },
  { key: 'memoryAvailable', label: 'Memória disponível', color: '#167a52' },
  { key: 'loadPerCore', label: 'Carga média por núcleo', color: '#3659a2' },
] as const;

function HistoryChart({ points }: { points: HealthChartPoint[] }) {
  const width = 720;
  const left = 42;
  const right = 700;
  const top = 14;
  const bottom = 156;
  const x = (index: number) => points.length < 2 ? (left + right) / 2 : left + index * (right - left) / (points.length - 1);
  const y = (value: number) => bottom - Math.max(0, Math.min(100, value)) / 100 * (bottom - top);

  return (
    <section className="card p-5" aria-labelledby="historico-servidor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="historico-servidor" className="text-lg font-semibold text-surface-900">Histórico das verificações</h2>
          <p className="mt-1 text-sm text-surface-600">Coletas dos últimos sete dias. A carga por núcleo é uma média, não o percentual de CPU usado.</p>
        </div>
        <span className="text-sm text-surface-600">{points.length} {points.length === 1 ? 'coleta' : 'coletas'}</span>
      </div>
      {points.length === 0 ? (
        <p className="mt-4 rounded-lg bg-surface-50 p-4 text-sm text-surface-600">O histórico começará a aparecer após a próxima execução do monitor.</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <svg className="min-w-[560px] w-full" viewBox={`0 0 ${width} 190`} role="img" aria-labelledby="chart-title chart-desc">
              <title id="chart-title">Gráfico histórico de saúde do servidor</title>
              <desc id="chart-desc">Disco usado, memória disponível e carga média por núcleo, em porcentagem, ao longo das coletas.</desc>
              {[0, 25, 50, 75, 100].map((tick) => <g key={tick}>
                <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#e5e7eb" strokeDasharray="3 4" />
                <text x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b">{tick}%</text>
              </g>)}
              {chartSeries.map((series) => {
                const values = points.map((point, index) => ({ index, value: point[series.key] })).filter((point): point is { index: number; value: number } => point.value !== null);
                if (!values.length) return null;
                const coords = values.map((point) => `${x(point.index)},${y(point.value)}`).join(' ');
                return <g key={series.key}>
                  {values.length > 1 && <polyline points={coords} fill="none" stroke={series.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
                  {values.map(({ index, value }) => <circle key={`${series.key}-${index}`} cx={x(index)} cy={y(value)} r="3" fill={series.color}>
                    <title>{`${series.label}: ${value.toFixed(1)}% · ${new Date(points[index].checkedAt).toLocaleString('pt-BR')}`}</title>
                  </circle>)}
                </g>;
              })}
            </svg>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-surface-700" aria-label="Legenda do gráfico">
            {chartSeries.map((series) => <span key={series.key} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} aria-hidden="true" />{series.label}</span>)}
          </div>
          <div className="mt-2 flex justify-between text-xs text-surface-500"><span>{new Date(points[0].checkedAt).toLocaleString('pt-BR')}</span><span>{new Date(points[points.length - 1].checkedAt).toLocaleString('pt-BR')}</span></div>
        </>
      )}
    </section>
  );
}

const toneClass = {
  success: 'alert-success',
  danger: 'alert-error',
  warning: 'alert bg-yellow-50 border-yellow-200 text-yellow-900',
} as const;

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [history, setHistory] = useState<SystemHealthHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([systemApi.health(), systemApi.healthHistory()])
      .then(([current, records]) => { setHealth(current); setHistory(records); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível consultar o servidor.'))
      .finally(() => setLoading(false));
  }, []);

  // O monitor grava a cada 5 minutos; atualizar a cada minuto basta.
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const summary = health ? healthSummary(health) : null;
  const metrics = health?.checks.filter((check) => check.status === 'metric') ?? [];
  const checks = health?.checks.filter((check) => check.status !== 'metric') ?? [];
  const chartPoints = healthChartPoints(history);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saúde do servidor"
        description="Resultado do monitor de saúde da Oracle: serviços, disco, memória, backup e HTTPS."
        actions={<Button onClick={load} loading={loading} loadingText="Atualizando" icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}>Atualizar</Button>}
      />

      {error && <p className="alert-error" role="alert">{error}</p>}

      {summary && (
        <section className={toneClass[summary.tone]} role="status" aria-live="polite">
          <p className="font-semibold flex items-center gap-2">
            {summary.tone === 'success' ? <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> : <AlertTriangle className="w-5 h-5" aria-hidden="true" />}
            {summary.title}
          </p>
          <p className="text-sm mt-1">{summary.description}</p>
          {health?.checkedAt && <p className="text-xs mt-2 opacity-80">Última verificação: {new Date(health.checkedAt).toLocaleString('pt-BR')}</p>}
        </section>
      )}

      <HistoryChart points={chartPoints} />

      {checks.length > 0 && (
        <section className="card" aria-labelledby="verificacoes">
          <h2 id="verificacoes" className="text-lg font-semibold text-surface-900 px-5 py-4 border-b border-surface-200">Verificações</h2>
          <ul className="divide-y divide-surface-100">
            {checks.map((check, index) => (
              <li key={`${index}-${check.message}`} className="flex items-center gap-3 px-5 py-3">
                {check.status === 'ok'
                  ? <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0" aria-hidden="true" />
                  : <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" aria-hidden="true" />}
                <span className="sr-only">{check.status === 'ok' ? 'OK:' : 'Alerta:'}</span>
                <span className={check.status === 'ok' ? 'text-surface-800' : 'text-red-800 font-medium'}>{check.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {metrics.length > 0 && (
        <section className="card p-5" aria-labelledby="metricas">
          <h2 id="metricas" className="text-lg font-semibold text-surface-900 flex items-center gap-2"><Activity className="w-5 h-5" aria-hidden="true" />Métricas</h2>
          <ul className="mt-2 text-sm text-surface-700 space-y-1">
            {metrics.map((metric) => <li key={metric.message}>{metric.message}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
