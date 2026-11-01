import { describe, expect, it } from 'vitest';
import { toAssistantCatalogTrip } from '../src/services/assistantCatalog.js';

const base = {
  title: 'Trilha do Jabre', city: 'Maturéia', region: 'PB', startDateISO: new Date('2026-12-01T00:00:00Z'), endDateISO: null,
  departureTime: '05h00', returnTime: null, scheduleTBD: false, meetingCity: 'Campina Grande', meetingPoint: 'Rodoviária', meetingTBD: false,
  priceValue: 120, priceUnit: 'por pessoa', free: false, spotsLeft: null, description: 'Experiência de natureza.',
  includes: '["Transporte"]', itinerary: null, importantInfo: '["Leve água"]', status: 'OPEN',
  media: '[{"src":"https://example.com/capa.jpg"}]',
};

describe('catálogo interno do agente', () => {
  it('expõe apenas a projeção comunicável e pede handoff para reserva', () => {
    expect(toAssistantCatalogTrip(base)).toEqual(expect.objectContaining({
      title: 'Trilha do Jabre', availability: 'CONFIRMAR_COM_EQUIPE', handoffRequiredForBooking: true,
      departure: { status: 'DEFINIDO', city: 'Campina Grande', place: 'Rodoviária' },
    }));
  });

  it('não inclui viagem esgotada ou não publicada', () => {
    expect(toAssistantCatalogTrip({ ...base, spotsLeft: 0 })).toBeNull();
    expect(toAssistantCatalogTrip({ ...base, status: 'DRAFT' })).toBeNull();
  });

  it('comunica embarque a confirmar sem inventar local', () => {
    expect(toAssistantCatalogTrip({ ...base, meetingCity: null, meetingPoint: null, meetingTBD: true })?.departure)
      .toEqual({ status: 'CONFIRMAR_COM_EQUIPE' });
  });
});
