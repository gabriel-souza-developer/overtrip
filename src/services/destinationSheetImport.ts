import type { SheetRow } from '../lib/xlsxReader.js';
import { normalizeForSearch } from '../utils/searchUtils.js';
import { labelForUrl, MAX_DESTINATION_LINKS, type DestinationLink } from './destinationBank.js';
import { destinationMatchKey, parseDestinationLabel } from './destinationNames.js';

export { parseDestinationLabel };

// Converte a aba "DESTINOS VISITADOS" da planilha antiga da empresa (colunas
// DATA, ORIGEM, DESTINOS, KMs, NÍVEL DA TRILHA, ROTA VIA MAPS, TRILHA
// WIKILOC, MELHOR ÉPOCA, RESUMO, PASSAGEIROS, R$ POR PESSOA, TOTAL DO
// TRANSPORTE, CONTRATANTE, TAXA ADICIONAL, DESPESA TOTAL, CAIXA) em destinos
// do banco privado. DESPESA TOTAL e CAIXA não são importadas: são calculadas
// pelo painel a partir das demais colunas.
//
// Linhas com data (ou mês) e destino viram uma SAÍDA do destino; linhas só
// com destino (a lista de possíveis destinos ao final) viram destino sem
// saída. Linhas sem nome de destino (meses vazios, links soltos) são
// ignoradas e contadas no relatório.

export interface ImportedOuting {
  date: string | null; // AAAA-MM-DD
  passengers: number | null;
  courtesySeats: number | null;
  pricePerPersonCents: number | null;
  transportCostCents: number | null;
  extraCostCents: number | null;
  supplier: string | null;
  notes: string | null;
}

export interface ImportedDestination {
  importKey: string;
  name: string;
  city: string | null;
  region: string | null;
  category: string | null;
  originCity: string | null;
  distanceKm: number | null;
  trailLevel: 'EASY' | 'MODERATE' | 'HARD' | null;
  bestSeason: string | null;
  notes: string | null;
  links: DestinationLink[];
  outings: ImportedOuting[];
}

export interface SheetImportReport { destinations: ImportedDestination[]; skippedRows: number[] }

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const EMPTY = /^\s*-?\s*$/;
// Texto longo (resumo do local): mantém as quebras de linha da célula.
const cleanMultiline = (value: string | undefined) => (value === undefined || EMPTY.test(value) ? null : value.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim());
const clean = (value: string | undefined) => (value === undefined || EMPTY.test(value) ? null : value.replace(/\s+/g, ' ').trim());

function excelSerialToDay(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  return new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
}

const toCents = (value: string | undefined) => {
  const text = clean(value);
  if (text === null) return null;
  const number = Number(text.replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
};
const toInt = (value: string | undefined) => {
  const text = clean(value);
  if (text === null) return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

function parseTrailLevel(value: string | undefined): ImportedDestination['trailLevel'] {
  const text = normalizeForSearch(clean(value) ?? '');
  if (text.startsWith('facil')) return 'EASY';
  if (text.startsWith('moder')) return 'MODERATE';
  if (text.startsWith('dific')) return 'HARD';
  return null;
}

export function inferDestinationCategory(name: string, camping: boolean): string | null {
  const text = normalizeForSearch(name);
  if (/\b(cachoeira|poco)\b/.test(text)) return 'Cachoeira';
  if (/\b(praia|barra|baia)\b/.test(text)) return 'Praia';
  if (/\blagoa\b/.test(text)) return 'Lagoa';
  if (/\bbalnea/.test(text)) return 'Balneário';
  if (/\bmirante\b/.test(text)) return 'Mirante';
  if (/\bgruta\b/.test(text)) return 'Gruta';
  if (/\brio\b/.test(text)) return 'Rio';
  if (/\b(pedra|trilha|serra)\b/.test(text)) return 'Trilha';
  if (/\b(area de lazer|sitio)\b/.test(text)) return 'Outro';
  return camping ? 'Camping' : null;
}

function addLink(links: DestinationLink[], raw: string | undefined) {
  const url = clean(raw)?.replace(/\s+/g, '');
  if (!url || !/^https?:\/\//i.test(url) || url.length > 600) return;
  try { new URL(url); } catch { return; }
  if (links.length >= MAX_DESTINATION_LINKS || links.some((link) => link.url === url)) return;
  links.push({ label: labelForUrl(url), url });
}

const sumCents = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

/**
 * A coluna CAIXA da planilha desconta lugares que não pagam (a partir de
 * set/2024, um por saída: CAIXA = (passageiros − 1) × valor − despesa). O
 * número de cortesias é recuperado da própria linha, só quando a diferença
 * é um múltiplo exato do valor por pessoa.
 */
export function inferCourtesySeats(passengers: number | null, priceCents: number | null, expenseCents: number | null, cashCents: number | null): number | null {
  if (passengers === null || !priceCents || expenseCents === null || cashCents === null) return null;
  const difference = passengers * priceCents - expenseCents - cashCents;
  if (difference <= 0 || difference % priceCents !== 0) return null;
  const seats = difference / priceCents;
  return seats <= passengers ? seats : null;
}

export function mapDestinationSheet(rows: SheetRow[]): SheetImportReport {
  const byKey = new Map<string, ImportedDestination>();
  const skippedRows: number[] = [];
  let year: number | null = null;

  for (const { row, cells } of rows) {
    if (row === 1) continue; // cabeçalho
    const yearCell = Number(cells.D);
    if (!clean(cells.C) && Number.isInteger(yearCell) && yearCell >= 2000 && yearCell <= 2100) { year = yearCell; continue; }
    const label = clean(cells.C);
    if (!label || /^https?:\/\//i.test(label)) {
      if (Object.values(cells).some((value) => !EMPTY.test(value))) skippedRows.push(row);
      continue;
    }

    const { name, city, region, camping } = parseDestinationLabel(label);
    const key = `sheet:${destinationMatchKey(name)}|${region ?? ''}`;
    let destination = byKey.get(key);
    if (!destination) {
      destination = {
        importKey: key, name, city, region,
        category: inferDestinationCategory(name, camping),
        originCity: clean(cells.B), distanceKm: null, trailLevel: null, bestSeason: null, notes: null, links: [], outings: [],
      };
      byKey.set(key, destination);
    }
    destination.city ??= city;
    destination.originCity ??= clean(cells.B);
    destination.distanceKm ??= toInt(clean(cells.D)?.replace(/\s*km$/i, ''));
    destination.trailLevel ??= parseTrailLevel(cells.E);
    destination.bestSeason ??= clean(cells.H);
    const summary = cleanMultiline(cells.I);
    if (summary && (!destination.notes || summary.length > destination.notes.length)) destination.notes = summary.slice(0, 5000);
    addLink(destination.links, cells.F);
    addLink(destination.links, cells.G);

    // Só as linhas com DATA (dia ou mês) são saídas realizadas.
    const dateCell = clean(cells.A);
    if (!dateCell) continue;
    const serialDay = excelSerialToDay(Number(dateCell));
    const monthIndex = MONTHS.indexOf(normalizeForSearch(dateCell));
    if (!serialDay && monthIndex < 0) continue;
    const notes = [
      camping ? 'Saída com camping.' : null,
      !serialDay && monthIndex >= 0 ? `Mês registrado na planilha: ${dateCell}${year ? `/${year}` : ''} (dia não informado).` : null,
    ].filter(Boolean).join(' ') || null;
    const passengers = toInt(cells.J);
    destination.outings.push({
      date: serialDay,
      passengers,
      courtesySeats: inferCourtesySeats(passengers, toCents(cells.K), toCents(cells.O) ?? sumCents(toCents(cells.L), toCents(cells.N)), toCents(cells.P)),
      pricePerPersonCents: toCents(cells.K),
      transportCostCents: toCents(cells.L),
      extraCostCents: toCents(cells.N) || null,
      supplier: clean(cells.M)?.slice(0, 120) ?? null,
      notes,
    });
  }
  return { destinations: [...byKey.values()], skippedRows };
}

/**
 * Correções confirmadas pela equipe sobre a planilha antiga (26/11/2026),
 * aplicadas depois da leitura. A chave de importação não muda, para a
 * importação continuar idempotente.
 */
export function applySheetCorrections(destinations: ImportedDestination[]): string[] {
  const applied: string[] = [];
  const find = (label: string) => destinations.find((destination) => destinationMatchKey(destination.name) === destinationMatchKey(label));

  const lagoaAzul = find('Lagoa Azul');
  if (lagoaAzul) {
    // A planilha repetia o link do Maps da Cachoeira de Ouricuri.
    lagoaAzul.city = 'Santa Rita';
    lagoaAzul.links = [
      { label: 'Google Maps', url: 'https://www.google.com/maps/search/?api=1&query=Lagoa+Azul%2C+Santa+Rita+-+PB' },
      ...lagoaAzul.links.filter((link) => link.label !== 'Google Maps'),
    ];
    applied.push('Lagoa Azul: link do Maps corrigido (Santa Rita - PB).');
  }

  const pureza = find('Olheiro de Pureza');
  if (pureza) {
    // A viagem aconteceu; o dia vem do mapa do site.
    for (const outing of pureza.outings) {
      if (outing.date === null) { outing.date = '2026-05-17'; outing.notes = 'Viagem realizada (data conforme o mapa do site).'; }
    }
    applied.push('Olho D\'água de Pureza: saída confirmada em 17/05/2026.');
  }

  const caraubas = find('Caraubas - Rio Paraíba');
  if (caraubas && caraubas.outings.length) {
    caraubas.outings = []; // a viagem não aconteceu: fica como possível destino.
    applied.push('Caraúbas: saída removida (viagem não aconteceu).');
  }

  const feijao = find('Rio do Feijão');
  const camping = feijao?.outings.find((outing) => outing.notes?.startsWith('Saída com camping'));
  if (camping) {
    // Acampamento de dois dias; o mapa do site registra o primeiro dia.
    camping.date = '2023-07-22';
    camping.notes = 'Camping de dois dias (22 e 23/07/2023).';
    applied.push('Rio do Feijão: camping registrado em 22 e 23/07/2023.');
  }

  const balneario = find('Balnearioa Rio Água Viva');
  if (balneario) {
    balneario.name = 'Balneário Rio Água Viva';
    balneario.city = 'Areia';
    applied.push('Balneário Rio Água Viva: nome e cidade corrigidos (Areia - PB, como no site).');
  }
  return applied;
}
