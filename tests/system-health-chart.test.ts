import { describe, expect, it } from 'vitest';
import { aggregateHealthPoints, healthChartPoints } from '../frontend/src/lib/systemHealth.js';

describe('métricas dos gráficos de saúde', () => {
  it('extrai disco, memória disponível e carga por núcleo sem chamar carga de uso de CPU', () => {
    expect(healthChartPoints([{
      checkedAt: '2026-11-10T12:00:00Z', ok: true,
      checks: [
        { status: 'ok', message: 'disco utilizado: 42%' },
        { status: 'ok', message: 'memória disponível: 63%' },
        { status: 'metric', message: 'carga 1 minuto=1.00; CPUs=4' },
      ],
    }])).toEqual([{ checkedAt: '2026-11-10T12:00:00Z', diskUsed: 42, memoryAvailable: 63, loadPerCore: 25 }]);
  });

  it('limita carga por núcleo a 100% e deixa séries ausentes como nulas', () => {
    expect(healthChartPoints([{
      checkedAt: '2026-11-10T12:00:00Z', ok: false,
      checks: [{ status: 'metric', message: 'carga 1 minuto=8.00; CPUs=4' }],
    }])).toEqual([{ checkedAt: '2026-11-10T12:00:00Z', diskUsed: null, memoryAvailable: null, loadPerCore: 100 }]);
  });

  it('agrupa coletas no intervalo e calcula médias sem preencher métricas ausentes', () => {
    expect(aggregateHealthPoints([
      { checkedAt: '2026-11-10T00:05:00Z', diskUsed: 40, memoryAvailable: 60, loadPerCore: 20 },
      { checkedAt: '2026-11-10T00:35:00Z', diskUsed: 50, memoryAvailable: null, loadPerCore: 40 },
      { checkedAt: '2026-11-10T01:05:00Z', diskUsed: 55, memoryAvailable: 45, loadPerCore: null },
    ], 60 * 60_000)).toEqual([
      { checkedAt: '2026-11-10T00:20:00.000Z', diskUsed: 45, memoryAvailable: 60, loadPerCore: 40 },
      { checkedAt: '2026-11-10T01:05:00.000Z', diskUsed: 55, memoryAvailable: 45, loadPerCore: null },
    ]);
  });
});
