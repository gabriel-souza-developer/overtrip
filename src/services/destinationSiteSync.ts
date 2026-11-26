import type { Prisma } from '@prisma/client';
import { normalizeForSearch } from '../utils/searchUtils.js';
import { currentLegacyDestinationFilter, currentLegacyTourismFilter, currentLegacyVisitFilterWithConsistentTrip, legacyTourismOrganizationIdForNewRecord } from './legacyTourismScope.js';
import { toSiteDate } from './publicTrips.js';
import { MAX_DESTINATION_LINKS, parseStoredLinks } from './destinationBank.js';
import { destinationMatchKey, parseDestinationLabel, prettyPlaceName } from './destinationNames.js';
import { inferDestinationCategory } from './destinationSheetImport.js';

// "Sincronizar com o site": liga as visitas do mapa e as viagens do painel
// aos destinos do banco privado, para que o banco mostre (por leitura, sem
// cópia) o que o site publica e o histórico de saídas fique completo.
//
// Regras (idempotente; pode rodar quantas vezes quiser):
// - Vínculo já existente nunca é trocado (pode ter sido corrigido à mão).
// - Reconhece o lugar só pelo nome (destinationMatchKey, com apelidos). Data
//   não basta: numa mesma saída a turma pode visitar vários lugares (ex.:
//   Cabedelo, 15/08/2026). Sem correspondência, cria o destino a partir do site.
// - Só completa campos VAZIOS do destino (cidade, UF, tipo, nível, link do
//   Maps); nunca sobrescreve o que a equipe preencheu.
// - Cria a saída do dia da visita/viagem quando ainda não há saída naquela
//   data (ou num dia vizinho: acampamento tem ida e volta em dias seguidos)
//   — só para datas que já passaram. Viagem futura só é vinculada.
// - Nunca escreve nada em Trip/Visit além de destinationId.

export interface SiteSyncReport {
  linkedVisits: number;
  linkedTrips: number;
  createdDestinations: number;
  createdOutings: number;
  filledFields: number;
}

type Tx = Prisma.TransactionClient;

interface BankDestination {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  category: string | null;
  trailLevel: string | null;
  links: string;
  outingDays: Set<string>;
  outingsCount: number;
  priceless: Map<string, string>; // dia → id da saída sem valor por pessoa
}

const INTENSITY_TO_TRAIL: Record<string, string> = { leve: 'EASY', moderado: 'MODERATE', intenso: 'HARD', extremo: 'HARD' };
const SKIPPED_TRIP_STATUSES = ['DRAFT', 'CANCELLED'];

export const siteDay = (date: Date) => toSiteDate(date).slice(0, 10);
const noonUtc = (day: string) => new Date(`${day}T12:00:00.000Z`);
const shiftDay = (day: string, delta: number) => new Date(noonUtc(day).getTime() + delta * 86400000).toISOString().slice(0, 10);
/** O dia registrado que corresponde a `day` (o próprio ou um vizinho), se houver. */
export function matchingDay(days: Set<string>, day: string): string | null {
  return [day, shiftDay(day, -1), shiftDay(day, 1)].find((candidate) => days.has(candidate)) ?? null;
}

export async function syncDestinationsWithSite(tx: Tx, now = new Date()): Promise<SiteSyncReport> {
  const report: SiteSyncReport = { linkedVisits: 0, linkedTrips: 0, createdDestinations: 0, createdOutings: 0, filledFields: 0 };
  const today = siteDay(now);

  const rows = await tx.destination.findMany({
    where: currentLegacyDestinationFilter(),
    select: { id: true, name: true, city: true, region: true, category: true, trailLevel: true, links: true, outings: { select: { id: true, date: true, pricePerPersonCents: true, parentOutingId: true } } },
  });
  const bank = new Map<string, BankDestination>();
  const byKey = new Map<string, BankDestination>();
  const toBank = (row: typeof rows[number]): BankDestination => {
    const days = new Set<string>();
    const priceless = new Map<string, string>();
    for (const outing of row.outings) {
      if (!outing.date) continue;
      const day = outing.date.toISOString().slice(0, 10);
      days.add(day);
      // Paradas de uma viagem com vários destinos não guardam valores (ficam na principal).
      if (outing.pricePerPersonCents === null && outing.parentOutingId === null) priceless.set(day, outing.id);
    }
    return { ...row, outingDays: days, outingsCount: row.outings.length, priceless };
  };
  for (const row of rows) {
    const entry = toBank(row);
    bank.set(entry.id, entry);
    const key = destinationMatchKey(entry.name);
    if (!byKey.has(key)) byKey.set(key, entry);
  }

  async function resolve(label: string, city: string, region: string): Promise<BankDestination> {
    const key = destinationMatchKey(label);
    const byName = byKey.get(key);
    if (byName) return byName;
    const parsed = parseDestinationLabel(label);
    const name = prettyPlaceName(parsed.name);
    const created = await tx.destination.create({
      data: {
        name,
        city: city || null,
        region: region || parsed.region,
        category: inferDestinationCategory(name, parsed.camping),
        status: 'IDEA',
        organizationId: legacyTourismOrganizationIdForNewRecord(),
        nameSearch: normalizeForSearch(name),
        citySearch: normalizeForSearch(city || ''),
      },
      select: { id: true, name: true, city: true, region: true, category: true, trailLevel: true, links: true, outings: { select: { id: true, date: true, pricePerPersonCents: true, parentOutingId: true } } },
    });
    report.createdDestinations++;
    const entry = toBank(created);
    bank.set(entry.id, entry);
    byKey.set(key, entry);
    return entry;
  }

  async function fill(destination: BankDestination, source: { city: string; region: string; trailLevel?: string | null; lat?: number | null; lng?: number | null; onMap?: boolean }) {
    const data: Prisma.DestinationUpdateInput = {};
    if (!destination.city && source.city && normalizeForSearch(source.city) !== normalizeForSearch(destination.name)) {
      data.city = source.city; data.citySearch = normalizeForSearch(source.city); destination.city = source.city;
    }
    if (!destination.region && /^[A-Z]{2}$/.test(source.region)) { data.region = source.region; destination.region = source.region; }
    if (!destination.category) {
      const category = inferDestinationCategory(destination.name, false);
      if (category) { data.category = category; destination.category = category; }
    }
    if (!destination.trailLevel && source.trailLevel) { data.trailLevel = source.trailLevel; destination.trailLevel = source.trailLevel; }
    const links = parseStoredLinks(destination.links);
    if (source.onMap && source.lat != null && source.lng != null && !links.some((link) => link.label === 'Google Maps') && links.length < MAX_DESTINATION_LINKS) {
      const next = [...links, { label: 'Google Maps', url: `https://www.google.com/maps?q=${source.lat},${source.lng}` }];
      data.links = JSON.stringify(next); destination.links = data.links;
    }
    const count = Object.keys(data).filter((key) => key !== 'citySearch').length;
    if (count) { await tx.destination.update({ where: { id: destination.id }, data }); report.filledFields += count; }
  }

  async function ensureOuting(destination: BankDestination, day: string | null, note: string, pricePerPersonCents: number | null) {
    if (day === null) {
      if (destination.outingsCount > 0) return;
      await tx.destinationOuting.create({ data: { destinationId: destination.id, notes: note, source: 'SITE' } });
      destination.outingsCount++; report.createdOutings++;
      return;
    }
    if (day > today) return;
    const existing = matchingDay(destination.outingDays, day);
    if (existing) {
      const pricelessId = destination.priceless.get(existing);
      if (pricelessId && pricePerPersonCents !== null) {
        await tx.destinationOuting.update({ where: { id: pricelessId }, data: { pricePerPersonCents } });
        destination.priceless.delete(existing); report.filledFields++;
      }
      return;
    }
    const created = await tx.destinationOuting.create({ data: { destinationId: destination.id, date: noonUtc(day), pricePerPersonCents, notes: note, source: 'SITE' }, select: { id: true } });
    // Uma viagem do mesmo dia, processada depois, ainda pode completar o valor.
    if (pricePerPersonCents === null) destination.priceless.set(day, created.id);
    destination.outingDays.add(day); destination.outingsCount++; report.createdOutings++;
  }

  const visits = await tx.visit.findMany({
    where: currentLegacyVisitFilterWithConsistentTrip(),
    select: { id: true, title: true, city: true, region: true, date: true, lat: true, lng: true, needsReview: true, destinationId: true },
    orderBy: [{ date: 'desc' }, { title: 'asc' }, { id: 'asc' }],
  });
  for (const visit of visits) {
    const day = visit.date ? siteDay(visit.date) : null;
    const linked = visit.destinationId ? bank.get(visit.destinationId) : undefined;
    const destination = linked ?? await resolve(visit.title, visit.city, visit.region);
    if (!linked) {
      const { count } = await tx.visit.updateMany({ where: { id: visit.id, destinationId: null }, data: { destinationId: destination.id } });
      report.linkedVisits += count;
    }
    await fill(destination, { city: visit.city, region: visit.region, lat: visit.lat, lng: visit.lng, onMap: !visit.needsReview });
    await ensureOuting(destination, day, day ? 'Registrada a partir do mapa do site.' : 'Visita registrada no mapa do site, sem data.', null);
  }

  const trips = await tx.trip.findMany({
    where: { AND: [currentLegacyTourismFilter(), { status: { notIn: SKIPPED_TRIP_STATUSES } }] },
    select: { id: true, title: true, city: true, region: true, startDateISO: true, priceValue: true, free: true, intensityClass: true, destinationId: true },
    orderBy: [{ startDateISO: 'desc' }, { id: 'asc' }],
  });
  for (const trip of trips) {
    const day = siteDay(trip.startDateISO);
    const linked = trip.destinationId ? bank.get(trip.destinationId) : undefined;
    const destination = linked ?? await resolve(trip.title, trip.city, trip.region);
    if (!linked) {
      const { count } = await tx.trip.updateMany({ where: { id: trip.id, destinationId: null }, data: { destinationId: destination.id } });
      report.linkedTrips += count;
    }
    await fill(destination, { city: trip.city, region: trip.region, trailLevel: INTENSITY_TO_TRAIL[trip.intensityClass] ?? null });
    const price = trip.free ? 0 : trip.priceValue != null ? Math.round(trip.priceValue * 100) : null;
    await ensureOuting(destination, day, 'Registrada a partir da viagem do site.', price);
  }
  return report;
}
