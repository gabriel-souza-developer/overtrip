import { describe, expect, it } from 'vitest';
import { buildTripProposal, tripProposalText } from '../frontend/src/lib/tripProposal';
import type { TripFormData } from '../frontend/src/api';

const base: TripFormData = { title: 'Viagem de teste', city: 'Lucena', region: 'PB', startDateISO: '2026-11-29', category: '', description: '' };

describe('prévia de proposta', () => {
  it('não inventa valores, condições ou pagamento ausentes', () => {
    const p = buildTripProposal(base, 'OVERTRIP');
    const text = tripProposalText(p);
    expect(p.price).toBeNull();
    expect(text).not.toMatch(/valor|pagamento|50%/i);
    expect(text).toContain('Destino: Lucena - PB');
    expect(text).toContain('Data: 29/11/2026');
  });
  it('usa somente termos fornecidos e mantém horário a confirmar', () => {
    const p = buildTripProposal({ ...base, free: true, scheduleTBD: true, meetingTBD: true, includes: ['Transporte'], itinerary: ['Praia'] }, 'Organizador');
    expect(p.price).toBe('Gratuito');
    expect(p.schedule).toBe('A confirmar');
    expect(p.departures).toEqual(['A confirmar']);
    expect(tripProposalText(p)).toContain('• Transporte');
    expect(tripProposalText(p)).toContain('• Praia');
  });
  it('inclui preço e embarque configurados, sem inserir regras de sinal', () => {
    const p = buildTripProposal({ ...base, priceValue: 120, priceUnit: 'por pessoa', departures: [{ time: '05h', place: 'Centro', city: 'Campina Grande', orderIndex: 0 }] }, 'OVERTRIP');
    expect(p.price).toContain('120,00');
    expect(p.departures[0]).toContain('Centro');
    expect(tripProposalText(p)).not.toMatch(/sinal|50%/i);
  });
});
