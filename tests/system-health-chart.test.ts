import { describe, expect, it } from 'vitest';
import { aggregateHealthPoints, healthChartPoints } from '../frontend/src/lib/systemHealth.js';

describe('métricas dos gráficos de saúde', () => {
  it('extrai disco, memória e carga média preservando a unidade e a quantidade de CPUs', () => {
    expect(healthChartPoints([{
      checkedAt: '2026-11-10T12:00:00Z', ok: true,
      checks: [
        { status: 'ok', message: 'disco utilizado: 42%' },
        { status: 'ok', message: 'memória disponível: 63%' },
        { status: 'metric', message: 'carga 1 minuto=1.00; CPUs=4' },
      ],
    }])).toEqual([{ checkedAt: '2026-11-10T12:00:00Z', diskUsed: 42, memoryAvailable: 63, loadAverage: 1, cpuCount: 4 }]);
  });

  it('preserva carga acima da quantidade de CPUs e deixa métricas ausentes como nulas', () => {
    expect(healthChartPoints([{
      checkedAt: '2026-11-10T12:00:00Z', ok: false,
      checks: [{ status: 'metric', message: 'carga 1 minuto=8.00; CPUs=4' }],
    }])).toEqual([{ checkedAt: '2026-11-10T12:00:00Z', diskUsed: null, memoryAvailable: null, loadAverage: 8, cpuCount: 4 }]);
  });

  it('agrupa coletas no intervalo e calcula médias sem preencher métricas ausentes', () => {
    expect(aggregateHealthPoints([
      { checkedAt: '2026-11-10T00:05:00Z', diskUsed: 40, memoryAvailable: 60, loadAverage: 0.8, cpuCount: 4 },
      { checkedAt: '2026-11-10T00:35:00Z', diskUsed: 50, memoryAvailable: null, loadAverage: 1.6, cpuCount: 4 },
      { checkedAt: '2026-11-10T01:05:00Z', diskUsed: 55, memoryAvailable: 45, loadAverage: null, cpuCount: null },
    ], 60 * 60_000)).toEqual([
      { checkedAt: '2026-11-10T00:20:00.000Z', diskUsed: 45, memoryAvailable: 60, loadAverage: 1.6, cpuCount: 4 },
      { checkedAt: '2026-11-10T01:05:00.000Z', diskUsed: 55, memoryAvailable: 45, loadAverage: null, cpuCount: null },
    ]);
  });
});
