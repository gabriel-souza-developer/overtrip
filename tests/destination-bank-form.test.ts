import { describe, it, expect } from 'vitest';
import { emptyDestinationForm, formToDestinationInput, formToOutingInput, emptyOutingForm, outingSourceLabel, outingToForm, previewOuting } from '../frontend/src/lib/destinationBank';
import type { DestinationOuting } from '../frontend/src/api/destinations';

describe('formulário do banco de destinos', () => {
  it('exige nome e valida distância e links', () => {
    expect(formToDestinationInput(emptyDestinationForm()).error).toMatch(/nome/);
    expect(formToDestinationInput({ ...emptyDestinationForm(), name: 'X', distanceKm: '12,5' }).error).toMatch(/Distância/);
    expect(formToDestinationInput({ ...emptyDestinationForm(), name: 'X', links: [{ label: 'Mapa', url: 'javascript:alert(1)' }] }).error).toMatch(/link/);
    const { data } = formToDestinationInput({ ...emptyDestinationForm(), name: ' Praia ', region: 'pb', distanceKm: '160', links: [{ label: '', url: '' }, { label: 'Maps', url: 'https://maps.app.goo.gl/x' }] });
    expect(data).toMatchObject({ name: 'Praia', region: 'PB', distanceKm: 160, city: null, links: [{ label: 'Maps', url: 'https://maps.app.goo.gl/x' }] });
  });

  it('converte reais em centavos e calcula a prévia', () => {
    expect(formToOutingInput({ ...emptyOutingForm(), pricePerPerson: '65,5x' }).error).toMatch(/Valor por pessoa/);
    const { data } = formToOutingInput({ ...emptyOutingForm(), date: '2025-03-30', passengers: '15', pricePerPerson: '65', transportCost: '800', extraCost: '85,50' });
    expect(data).toMatchObject({ date: '2025-03-30', passengers: 15, pricePerPersonCents: 6500, transportCostCents: 80000, extraCostCents: 8550, supplier: null });
    expect(previewOuting(data!)).toEqual({ revenueCents: 97500, expenseCents: 88550, resultCents: 8950 });
    const withCourtesy = formToOutingInput({ ...emptyOutingForm(), passengers: '15', courtesySeats: '1', pricePerPerson: '65', transportCost: '800', extraCost: '85' }).data!;
    expect(previewOuting(withCourtesy)).toEqual({ revenueCents: 91000, expenseCents: 88500, resultCents: 2500 });
    expect(formToOutingInput({ ...emptyOutingForm(), passengers: '2', courtesySeats: '3' }).error).toMatch(/Cortesias/);
  });

  it('reabre uma saída salva com os mesmos valores', () => {
    const form = outingToForm({ id: 'o', date: '2025-03-30T12:00:00.000Z', passengers: 15, courtesySeats: null, pricePerPersonCents: 6550, transportCostCents: 80000, extraCostCents: null, supplier: 'Van', notes: null, updatedAt: '', revenueCents: null, expenseCents: null, resultCents: null });
    expect(form).toEqual({ date: '2025-03-30', status: '', passengers: '15', courtesySeats: '', pricePerPerson: '65,50', transportCost: '800', extraCost: '', supplier: 'Van', notes: '' });
    expect(formToOutingInput(form).data).toMatchObject({ status: null, pricePerPersonCents: 6550, transportCostCents: 80000 });
  });

  it('envia a situação escolhida e recusa realizada no futuro', () => {
    expect(formToOutingInput({ ...emptyOutingForm(), date: '2025-03-30', status: 'CANCELLED' }).data).toMatchObject({ status: 'CANCELLED' });
    expect(formToOutingInput({ ...emptyOutingForm(), date: '2099-01-01', status: 'REALIZED' }).error).toMatch(/futura/);
    expect(formToOutingInput({ ...emptyOutingForm(), date: '2099-01-01', status: 'PLANNED' }).data).toMatchObject({ status: 'PLANNED' });
  });

  it('mostra a origem gravada e nunca a envia ao editar', () => {
    expect(outingSourceLabel('SITE')).toBe('Criada pelo site');
    expect(outingSourceLabel('SHEET')).toBe('Importada da planilha');
    expect(outingSourceLabel('TEAM')).toBe('Lançada pela equipe');
    expect(outingSourceLabel(null)).toBe('Registro anterior (equipe ou planilha)');
    // Editar observações de uma saída do site: o envio não leva a origem (a API recusaria).
    const outing = { id: 'o', date: '2025-09-01T12:00:00.000Z', status: null, effectiveStatus: 'UNCONFIRMED', statusConfirmed: false, parentOutingId: null, trip: null,
      passengers: 8, courtesySeats: null, pricePerPersonCents: 5000, transportCostCents: 10000, extraCostCents: null, supplier: null,
      notes: 'Registrada a partir do mapa do site.', source: 'SITE', updatedAt: '2025-09-01T12:00:00.000Z', revenueCents: 40000, expenseCents: 10000, resultCents: 30000, onSite: true } satisfies DestinationOuting;
    const { data } = formToOutingInput({ ...outingToForm(outing), notes: 'Turma do colégio.' });
    expect(data).toMatchObject({ notes: 'Turma do colégio.' });
    expect(data).not.toHaveProperty('source');
  });
});
