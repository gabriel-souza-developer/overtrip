import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { healthSummary } from '../frontend/src/lib/systemHealth';

describe('resumo do monitor no painel', () => {
  it('só mostra saudável quando o estado é ok', () => {
    expect(healthSummary({ state: 'ok', ageMinutes: 0 })).toMatchObject({ tone: 'success', title: 'Servidor saudável' });
    expect(healthSummary({ state: 'ok', ageMinutes: 0 }).description).toContain('menos de 1 minuto');
    expect(healthSummary({ state: 'alert', ageMinutes: 3 }).tone).toBe('danger');
    expect(healthSummary({ state: 'stale', ageMinutes: 40 })).toMatchObject({ tone: 'warning' });
    expect(healthSummary({ state: 'stale', ageMinutes: 40 }).description).toContain('há 40 min');
    expect(healthSummary({ state: 'unavailable', ageMinutes: null }).tone).toBe('warning');
  });

  it('o menu Servidor aparece só para administradores', () => {
    const layout = readFileSync('frontend/src/components/Layout.tsx', 'utf8');
    expect(layout).toMatch(/path: '\/system'.*adminOnly: true/);
  });
});
