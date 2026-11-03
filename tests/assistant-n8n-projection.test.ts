import { describe, expect, it } from 'vitest';
import { toAssistantCatalogTrip } from '../src/services/assistantCatalog.js';
import { toN8nTrip } from '../src/services/assistantN8nProjection.js';

describe('projeção reduzida para o n8n', () => {
  it('mantém incertezas explícitas e não expõe campos operacionais', () => {
    const source = { title: 'Trilha', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T00:00:00Z'), endDateISO: null, departureTime: null, returnTime: null, scheduleTBD: true, meetingCity: null, meetingPoint: null, meetingTBD: true, priceValue: 120, priceUnit: 'por pessoa', free: false, spotsLeft: null, description: 'Passeio', includes: '[]', itinerary: null, importantInfo: null, media: '[{"src":"a"}]', status: 'OPEN', internalNote: 'privado' };
    const result = toN8nTrip(toAssistantCatalogTrip(source, new Date('2029-01-01T00:00:00Z'))!);
    expect(result).toMatchObject({ title: 'Trilha', dateDisplay: '01/01/2030', priceValue: 120, status: 'open', meetingTBD: true, spotsLeft: null, handoffRequiredForBooking: true });
    expect(result).not.toHaveProperty('internalNote');
    expect(result).not.toHaveProperty('media');
    expect(result).not.toHaveProperty('depositDisplay');
  });
});
