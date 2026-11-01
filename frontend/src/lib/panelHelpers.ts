// Funções puras dos formulários e listas do painel (testadas em tests/panelHelpers.test.ts).

export const TRIP_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  OPEN: 'Publicada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
  SOLD_OUT: 'Esgotada',
  CLOSED: 'Fechada',
};

export function tripStatusLabel(status: string): string {
  return TRIP_STATUS_LABELS[status] ?? status;
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** 'YYYY-MM-DDTHH:mm' (ou só a data) -> '15 de janeiro de 2026'. Vazio/inválido -> ''. */
export function formatDateDisplay(localInput: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(localInput ?? '');
  if (!m) return '';
  const month = Number(m[2]);
  if (month < 1 || month > 12) return '';
  return `${Number(m[3])} de ${MONTHS[month - 1]} de ${m[1]}`;
}

/** Troca dois vizinhos de lugar sem alterar a lista original. */
export function moveItem<T>(list: T[], index: number, direction: 'up' | 'down'): T[] {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Posições a gravar depois de reordenar uma página da galeria. Reaproveita as posições
 * que a própria página já ocupava (para a página 2 não voltar ao início); se elas se
 * repetirem, numera a partir do começo da página.
 */
export function reorderPositions(currentPositions: number[], pageStart: number): number[] {
  const sorted = [...currentPositions].sort((a, b) => a - b);
  const distinct = sorted.every((value, i) => i === 0 || value > sorted[i - 1]);
  return distinct ? sorted : sorted.map((_, i) => pageStart + i);
}

/** Números de página a mostrar (no máximo 5), centrados na página atual. */
export function buildPageNumbers(page: number, totalPages: number): number[] {
  const count = Math.min(5, totalPages);
  let start = 1;
  if (totalPages > 5) {
    if (page <= 3) start = 1;
    else if (page >= totalPages - 2) start = totalPages - 4;
    else start = page - 2;
  }
  return Array.from({ length: count }, (_, i) => start + i);
}

/** Quantos dos valores têm algo preenchido (texto não vazio, número, lista com itens, caixa marcada). */
export function countFilled(values: unknown[]): number {
  return values.filter((v) => {
    if (v === null || v === undefined || v === false) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
}

/** Quantos campos da seção "Ajustes do site" estão diferentes do valor automático (padrões não contam). */
export function countAdvancedFilled(f: {
  headlineDisplay: string; priceDisplay: string; priceUnit: string; departureTolerance: string;
  buttonLabel: string; buttonClass: string; scheduleInfo: string; scheduleTBD: boolean;
  trailDistance: string; supportPoint: string; supportPointInfo: string; includesHighlight: string;
  includedServices: unknown[]; meetingDetails: string; meetingMapsQuery: string; departures: unknown[];
}): number {
  return countFilled([
    f.headlineDisplay, f.priceDisplay, f.departureTolerance, f.scheduleInfo, f.scheduleTBD,
    f.trailDistance, f.supportPoint, f.supportPointInfo, f.includesHighlight, f.includedServices,
    f.meetingDetails, f.meetingMapsQuery, f.departures,
    f.priceUnit !== 'por pessoa' ? f.priceUnit : '',
    f.buttonLabel !== 'Quero viajar' ? f.buttonLabel : '',
    f.buttonClass !== 'button-dark' ? f.buttonClass : '',
  ]);
}

export const DEFAULT_TRIP_CATEGORY = 'Viagem';

interface TripLike {
  title: string;
  category: string;
  description: string;
}

/**
 * A API exige categoria e descrição. Quando a pessoa não preenche, usamos valores simples
 * (categoria "Viagem" e o próprio título). Campos já preenchidos nunca são trocados.
 */
export function applyTripDefaults<T extends TripLike>(data: T): T {
  return {
    ...data,
    category: data.category.trim() || DEFAULT_TRIP_CATEGORY,
    description: data.description.trim() || data.title.trim(),
  };
}

interface TripMinimum {
  title: string;
  region: string;
  city: string;
  startDateISO: string;
  status: string;
  free: boolean;
  priceValue: number | null;
  media: unknown[];
}

/**
 * Mínimo para salvar: título, estado, cidade e data. Para publicar (situação "Publicada")
 * também pedimos foto e valor (ou "viagem gratuita"), porque aparecem no site.
 */
export function validateTripMinimum(data: TripMinimum): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.title.trim()) errors.title = 'Escreva o nome da viagem.';
  if (!data.region.trim()) errors.region = 'Escolha o estado.';
  if (!data.city.trim()) errors.city = 'Escolha a cidade.';
  if (!data.startDateISO) errors.startDateISO = 'Informe a data de saída.';
  if (data.status === 'OPEN') {
    if (data.media.length === 0) errors.media = 'Para publicar, adicione pelo menos uma foto.';
    if (!data.free && !(data.priceValue && data.priceValue > 0)) {
      errors.priceValue = 'Para publicar, informe o valor ou marque “Viagem gratuita”.';
    }
  }
  return errors;
}

/**
 * Valor digitado -> número. Aceita o jeito brasileiro: "109,99", "1.250,00", "R$ 1.250,50", "1250".
 * Um ponto sozinho é decimal ("109.99"), exceto quando separa milhares ("1.250"). Vazio ou inválido -> null.
 */
export function parsePriceInput(text: string | null | undefined): number | null {
  const raw = (text ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw) return null;
  let normalized: string;
  if (raw.includes(',')) {
    // Vírgula é o decimal; pontos antes dela são milhares.
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(raw)) return null;
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  } else if (/^\d+(\.\d{1,2})?$/.test(raw)) {
    normalized = raw;
  } else {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Número -> texto do campo de valor, no jeito brasileiro ("1.250,00"). Vazio -> ''. */
export function formatPriceInput(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PublishCheck = Omit<TripMinimum, 'status'>;

/**
 * O que falta para publicar (mesma regra do formulário): lista de mensagens. Vazia = pode publicar.
 * Viagem gratuita não exige valor.
 */
export function publishProblems(trip: PublishCheck): string[] {
  const errors = validateTripMinimum({ ...trip, status: 'OPEN' });
  return Object.values(errors);
}

export type TripListAction = 'publish' | 'unpublish' | null;

/**
 * Botão de situação da lista de viagens. Só administradores mudam a situação (a API recusa os outros).
 * "Publicar" só para rascunho; "Tirar do site" só para publicada, esgotada ou fechada.
 * Concluída e cancelada não têm botão: despublicar apagaria a situação (muda-se no formulário).
 */
export function tripListAction(status: string, isAdmin: boolean): TripListAction {
  if (!isAdmin) return null;
  if (status === 'DRAFT') return 'publish';
  if (status === 'OPEN' || status === 'SOLD_OUT' || status === 'CLOSED') return 'unpublish';
  return null;
}

/** Texto digitado -> número inteiro (só dígitos). Vazio ou sem dígitos -> null. */
export function parseWholeNumber(text: string | null | undefined): number | null {
  const digits = (text ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}
