import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import { systemApi } from '../api';
import { healthSummary, type SystemHealth } from '../lib/systemHealth';

const toneClass = {
  success: 'alert-success',
  danger: 'alert-error',
  warning: 'alert bg-yellow-50 border-yellow-200 text-yellow-900',
} as const;

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    systemApi.health()
      .then(setHealth)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servidor"
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
