import { describe, expect, it } from 'vitest';
import { prepareTripTemplate } from '../frontend/src/lib/tripTemplate';

describe('usar viagem como modelo', () => {
  it('preserva dados úteis, limpa informações da edição anterior e cria rascunho', () => {
    const original = { title: 'Trilha', startDateISO: '2026-11-29', endDateISO: '2026-11-30', headlineDisplay: 'Domingo 29', scheduleInfo: '29 de novembro', spotsLeft: 2, status: 'OPEN', availabilitySchema: 'https://schema.org/SoldOut', city: 'Lucena', priceValue: 100 };
    const result = prepareTripTemplate(original);
    expect(result).toMatchObject({ title: 'Trilha', city: 'Lucena', priceValue: 100, startDateISO: '', endDateISO: '', headlineDisplay: '', scheduleInfo: '', spotsLeft: null, status: 'DRAFT', availabilitySchema: 'https://schema.org/InStock' });
    expect(original.status).toBe('OPEN');
    expect(original.startDateISO).toBe('2026-11-29');
  });
});
