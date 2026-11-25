import type { Destination, DestinationCategory, DestinationInput, DestinationOuting, DestinationStatus, OutingInput, TrailLevel } from '../api/destinations';
import { reservationMoneyToCents } from './reservationMoney';

export const formatMoney = (cents: number | null) => (cents === null ? '—' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const centsToInput = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, ''));

export interface DestinationForm {
  name: string; city: string; region: string; category: DestinationCategory | ''; status: DestinationStatus;
  originCity: string; distanceKm: string; trailLevel: TrailLevel | ''; bestSeason: string; notes: string;
  links: Array<{ label: string; url: string }>;
}

export const emptyDestinationForm = (): DestinationForm => ({
  name: '', city: '', region: '', category: '', status: 'IDEA', originCity: 'Campina Grande', distanceKm: '', trailLevel: '', bestSeason: '', notes: '', links: [],
});

export const destinationToForm = (destination: Destination): DestinationForm => ({
  name: destination.name, city: destination.city ?? '', region: destination.region ?? '', category: destination.category ?? '', status: destination.status,
  originCity: destination.originCity ?? '', distanceKm: destination.distanceKm === null ? '' : String(destination.distanceKm), trailLevel: destination.trailLevel ?? '',
  bestSeason: destination.bestSeason ?? '', notes: destination.notes ?? '', links: destination.links.map((link) => ({ ...link })),
});

export function formToDestinationInput(form: DestinationForm): { data?: DestinationInput; error?: string } {
  if (!form.name.trim()) return { error: 'Informe o nome do destino.' };
  const distance = form.distanceKm.trim();
  if (distance && !/^\d{1,5}$/.test(distance)) return { error: 'Distância deve ser um número inteiro de km.' };
  const links = form.links.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter((link) => link.label || link.url);
  if (links.some((link) => !link.label || !/^https?:\/\/\S+$/i.test(link.url))) return { error: 'Cada link precisa de um nome e de um endereço começando com http:// ou https://.' };
  const text = (value: string) => value.trim() || null;
  return {
    data: {
      name: form.name.trim(), city: text(form.city), region: text(form.region)?.toUpperCase() ?? null, category: form.category || null, status: form.status,
      originCity: text(form.originCity), distanceKm: distance ? Number(distance) : null, trailLevel: form.trailLevel || null,
      bestSeason: text(form.bestSeason), notes: text(form.notes), links,
    },
  };
}

export interface OutingForm { date: string; passengers: string; courtesySeats: string; pricePerPerson: string; transportCost: string; extraCost: string; supplier: string; notes: string }

export const emptyOutingForm = (): OutingForm => ({ date: '', passengers: '', courtesySeats: '', pricePerPerson: '', transportCost: '', extraCost: '', supplier: '', notes: '' });

export const outingToForm = (outing: DestinationOuting): OutingForm => ({
  date: outing.date ? outing.date.slice(0, 10) : '', passengers: outing.passengers === null ? '' : String(outing.passengers),
  courtesySeats: outing.courtesySeats === null ? '' : String(outing.courtesySeats),
  pricePerPerson: centsToInput(outing.pricePerPersonCents), transportCost: centsToInput(outing.transportCostCents), extraCost: centsToInput(outing.extraCostCents),
  supplier: outing.supplier ?? '', notes: outing.notes ?? '',
});

export function formToOutingInput(form: OutingForm): { data?: OutingInput; error?: string } {
  const money = (value: string, label: string): number | null | string => {
    if (!value.trim()) return null;
    const cents = reservationMoneyToCents(value);
    return cents === null ? `${label}: use um valor como 65 ou 65,50.` : cents;
  };
  const passengers = form.passengers.trim();
  if (passengers && !/^\d{1,4}$/.test(passengers)) return { error: 'Passageiros deve ser um número inteiro.' };
  const courtesy = form.courtesySeats.trim();
  if (courtesy && !/^\d{1,4}$/.test(courtesy)) return { error: 'Cortesias deve ser um número inteiro.' };
  if (courtesy && passengers && Number(courtesy) > Number(passengers)) return { error: 'Cortesias não podem passar do número de passageiros.' };
  const values = [money(form.pricePerPerson, 'Valor por pessoa'), money(form.transportCost, 'Transporte'), money(form.extraCost, 'Taxas extras')];
  const invalid = values.find((value) => typeof value === 'string');
  if (typeof invalid === 'string') return { error: invalid };
  const [pricePerPersonCents, transportCostCents, extraCostCents] = values as Array<number | null>;
  return {
    data: {
      date: form.date || null, passengers: passengers ? Number(passengers) : null, courtesySeats: courtesy ? Number(courtesy) : null, pricePerPersonCents, transportCostCents, extraCostCents,
      supplier: form.supplier.trim() || null, notes: form.notes.trim() || null,
    },
  };
}

/** Mesma conta da API (destinationBank.ts): para mostrar o resultado enquanto se digita. */
export function previewOuting(input: OutingInput) {
  const paying = input.passengers !== null ? Math.max(0, input.passengers - (input.courtesySeats ?? 0)) : null;
  const revenueCents = paying !== null && input.pricePerPersonCents !== null ? paying * input.pricePerPersonCents : null;
  const hasExpense = input.transportCostCents !== null || input.extraCostCents !== null;
  const expenseCents = hasExpense ? (input.transportCostCents ?? 0) + (input.extraCostCents ?? 0) : null;
  return { revenueCents, expenseCents, resultCents: revenueCents !== null && expenseCents !== null ? revenueCents - expenseCents : null };
}
