import { describe, expect, it } from 'vitest';
import { prepareOrgTripTemplate, prepareTripTemplate } from '../frontend/src/lib/tripTemplate';

describe('usar viagem como modelo', () => {
  it('preserva dados úteis, limpa informações da edição anterior e cria rascunho', () => {
    const original = { title: 'Trilha', startDateISO: '2026-11-29', endDateISO: '2026-11-30', headlineDisplay: 'Domingo 29', scheduleInfo: '29 de novembro', spotsLeft: 2, status: 'OPEN', availabilitySchema: 'https://schema.org/SoldOut', city: 'Lucena', priceValue: 100 };
    const result = prepareTripTemplate(original);
    expect(result).toMatchObject({ title: 'Trilha', city: 'Lucena', priceValue: 100, startDateISO: '', endDateISO: '', headlineDisplay: '', scheduleInfo: '', spotsLeft: null, status: 'DRAFT', availabilitySchema: 'https://schema.org/InStock' });
    expect(original.status).toBe('OPEN');
    expect(original.startDateISO).toBe('2026-11-29');
  });
});

describe('usar viagem como modelo (painel de empresa)', () => {
  it('preserva conteúdo reaproveitável e limpa data, horário, vagas e embarques antigos', () => {
    const original = {
      title: 'Trilha da Serra', city: 'Lucena', region: 'PB', priceValue: 109.9, includes: ['Transporte'],
      startDateISO: '2026-11-29T09:00', endDateISO: '2026-11-30T17:00', headlineDisplay: 'Domingo 29',
      departureTime: '06h00', returnTime: '20h00', scheduleInfo: '29 de novembro', scheduleTBD: false,
      spotsLeft: '2',
      departures: [{ time: '06h00', place: 'Praça da Bandeira', city: 'Campina Grande', mapsUrl: '', mapsQuery: '', orderIndex: 0 }],
    };
    const result = prepareOrgTripTemplate(original);
    expect(result).toMatchObject({
      title: 'Trilha da Serra', city: 'Lucena', region: 'PB', priceValue: 109.9, includes: ['Transporte'],
      startDateISO: '', endDateISO: '', headlineDisplay: '',
      departureTime: '', returnTime: '', scheduleInfo: '', scheduleTBD: false,
      spotsLeft: '', departures: [],
    });
    // Nunca muta a viagem de origem: só o objeto devolvido fica limpo.
    expect(original.startDateISO).toBe('2026-11-29T09:00');
    expect(original.departures).toHaveLength(1);
  });
});
