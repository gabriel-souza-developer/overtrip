import { describe, expect, it } from 'vitest';
import { conflictingTripFields, effectiveOutingStatus } from '../src/services/destinationBank.js';
import { summarizeFinanceOutings, type FinanceOutingInput } from '../src/services/financeSummary.js';

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const NOW = new Date('2026-11-26T15:00:00.000Z');
const SITE = 'Registrada a partir do mapa do site.';

describe('situação efetiva da saída', () => {
  it('usa o status gravado e marca como confirmado', () => {
    expect(effectiveOutingStatus({ status: 'CANCELLED', date: day('2026-08-15') }, NOW)).toEqual({ status: 'CANCELLED', confirmed: true });
    expect(effectiveOutingStatus({ status: 'PLANNED', date: day('2020-01-01') }, NOW)).toEqual({ status: 'PLANNED', confirmed: true });
  });
  it('não trata o site como prova de realização', () => {
    expect(effectiveOutingStatus({ status: null, date: day('2026-08-15'), notes: SITE }, NOW)).toEqual({ status: 'UNCONFIRMED', confirmed: false });
    expect(effectiveOutingStatus({ status: null, date: null, notes: 'Visita registrada no mapa do site, sem data.' }, NOW).status).toBe('UNCONFIRMED');
  });
  it('mantém a regra antiga para registros da equipe/planilha sem status', () => {
    expect(effectiveOutingStatus({ status: null, date: day('2025-02-23') }, NOW)).toEqual({ status: 'REALIZED', confirmed: false });
    expect(effectiveOutingStatus({ status: null, date: null }, NOW).status).toBe('REALIZED');
    expect(effectiveOutingStatus({ status: null, date: day('2027-01-01') }, NOW)).toEqual({ status: 'PLANNED', confirmed: false });
  });
  it('compara pelo dia civil de São Paulo', () => {
    // 15/08 02:00 UTC ainda é 14/08 em São Paulo: a saída de 15/08 é futura.
    expect(effectiveOutingStatus({ status: null, date: day('2026-08-15') }, new Date('2026-08-15T02:00:00.000Z')).status).toBe('PLANNED');
    expect(effectiveOutingStatus({ status: null, date: day('2026-08-15') }, new Date('2026-08-15T03:30:00.000Z')).status).toBe('REALIZED');
  });
});

describe('conflitos ao juntar uma parada', () => {
  it('só aponta valores próprios diferentes; em branco ou iguais não conflitam', () => {
    const primary = { status: null, passengers: 20, pricePerPersonCents: 6500, transportCostCents: 70000 };
    expect(conflictingTripFields(primary, { passengers: null, pricePerPersonCents: 6500 })).toEqual([]);
    expect(conflictingTripFields(primary, { passengers: 18, transportCostCents: 70000, status: 'REALIZED' })).toEqual(['status', 'passengers']);
  });
});

describe('financeiro com viagens de vários destinos', () => {
  const base = { courtesySeats: null, extraCostCents: null } as const;
  const rows: FinanceOutingInput[] = [
    // Viagem de 15/08/2026: valores só na principal; duas paradas sem valores.
    { ...base, id: 'p', destinationId: 'dique', destinationName: 'Dique de Cabedelo', date: day('2026-08-15'), status: 'REALIZED', passengers: 20, pricePerPersonCents: 6500, transportCostCents: 70000, notes: SITE,
      stops: [{ destinationId: 'fortaleza', destinationName: 'Fortaleza de Santa Catarina' }, { destinationId: 'formosa', destinationName: 'Praia Formosa' }] },
    { ...base, id: 's1', destinationId: 'fortaleza', destinationName: 'Fortaleza de Santa Catarina', date: day('2026-08-15'), status: null, parentOutingId: 'p', passengers: 20, pricePerPersonCents: 6500, transportCostCents: 70000 },
    { ...base, id: 's2', destinationId: 'formosa', destinationName: 'Praia Formosa', date: day('2026-08-15'), status: null, parentOutingId: 'p', passengers: null, pricePerPersonCents: null, transportCostCents: null },
    // Outros estados.
    { ...base, id: 'legacy', destinationId: 'lagoa', destinationName: 'Lagoa', date: day('2026-02-01'), status: null, passengers: 10, pricePerPersonCents: 5000, transportCostCents: 20000 },
    { ...base, id: 'site', destinationId: 'rio', destinationName: 'Rio', date: day('2026-09-01'), status: null, passengers: 5, pricePerPersonCents: 5000, transportCostCents: 1000, notes: SITE },
    { ...base, id: 'cancel', destinationId: 'rio', destinationName: 'Rio', date: day('2026-03-01'), status: 'CANCELLED', passengers: 5, pricePerPersonCents: 5000, transportCostCents: 1000 },
    { ...base, id: 'plan', destinationId: 'rio', destinationName: 'Rio', date: day('2026-04-01'), status: 'PLANNED', passengers: 5, pricePerPersonCents: 5000, transportCostCents: 1000 },
  ];
  const summary = summarizeFinanceOutings(rows, 2026, NOW);

  it('conta a viagem uma vez, com os valores da principal', () => {
    expect(summary.outings.map((outing) => outing.id).sort()).toEqual(['legacy', 'p']);
    expect(summary.totals).toMatchObject({ outings: 2, completeOutings: 2, revenueCents: 20 * 6500 + 10 * 5000, expenseCents: 70000 + 20000 });
    const trip = summary.byDestination.find((row) => row.destinationIds.length === 3)!;
    expect(trip).toMatchObject({ name: 'Dique de Cabedelo + Fortaleza de Santa Catarina + Praia Formosa', outings: 1, revenueCents: 130000, resultCents: 60000 });
    expect(summary.outings.find((outing) => outing.id === 'p')).toMatchObject({ status: 'REALIZED', statusConfirmed: true, stops: [{ destinationName: 'Fortaleza de Santa Catarina' }, { destinationName: 'Praia Formosa' }] });
  });
  it('deixa fora dos totais o que é planejado, cancelado ou só veio do site', () => {
    expect(summary).toMatchObject({ plannedOutings: 1, cancelledOutings: 1, unconfirmedOutings: 1, legacyRealizedOutings: 1 });
    expect(summary.toConfirm.map((outing) => outing.id)).toEqual(['site']);
  });
  it('sem status gravado, a viagem do site fica a confirmar (nunca conta sozinha)', () => {
    const unconfirmed = summarizeFinanceOutings(rows.map((row) => (row.id === 'p' ? { ...row, status: null } : row)), 2026, NOW);
    expect(unconfirmed.outings.map((outing) => outing.id)).toEqual(['legacy']);
    expect(unconfirmed.toConfirm.map((outing) => outing.id).sort()).toEqual(['p', 'site']);
  });
});
