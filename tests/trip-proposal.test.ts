import { describe, expect, it } from 'vitest';
import { buildTripProposal, tripProposalText } from '../frontend/src/lib/tripProposal';
import type { TripFormData } from '../frontend/src/api';

const base: TripFormData = { title: 'Viagem de teste', city: 'Lucena', region: 'PB', startDateISO: '2026-11-29', category: '', description: '' };

describe('prévia de proposta', () => {
  it('usa nomes de contexto quando a agência ou o nome da viagem estão vazios', () => {
    const p = buildTripProposal({ ...base, title: '' }, '   ');
    expect(p.organizer).toBe('Agência ou organizador');
    expect(p.title).toBe('Nova viagem');
    expect(tripProposalText(p)).toContain('Nova viagem');
  });

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
  it('mostra o horário preenchido no formato do site, mesmo com "horário não definido" marcado', () => {
    // Causa do bug: a prévia dava prioridade a scheduleTBD e escondia a hora digitada;
    // e o formulário guarda a hora como 'HH:mm', que saía diferente do site ('05h30').
    const p = buildTripProposal({ ...base, departureTime: '05:30', returnTime: '17:00', scheduleTBD: true, scheduleInfo: '' }, 'OVERTRIP');
    expect(p.schedule).toBe('Saída: 05h30 · Retorno: 17h00');
    expect(tripProposalText(p)).toContain('Horário: Saída: 05h30 · Retorno: 17h00');
  });
  it('aceita a hora já no formato do site e só o retorno', () => {
    expect(buildTripProposal({ ...base, departureTime: '04h30', returnTime: '17h' }, 'OVERTRIP').schedule).toBe('Saída: 04h30 · Retorno: 17h');
    expect(buildTripProposal({ ...base, returnTime: '17h' }, 'OVERTRIP').schedule).toBe('Retorno: 17h');
  });
  it('horário em texto livre vence os campos de hora; sem nada e a confirmar, mostra "A confirmar"', () => {
    expect(buildTripProposal({ ...base, scheduleInfo: '05h às 17h', departureTime: '04:30' }, 'OVERTRIP').schedule).toBe('05h às 17h');
    expect(buildTripProposal({ ...base, scheduleTBD: true }, 'OVERTRIP').schedule).toBe('A confirmar');
    expect(buildTripProposal(base, 'OVERTRIP').schedule).toBeNull();
  });
});
