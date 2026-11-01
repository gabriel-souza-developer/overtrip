// Sugestões da IA para o formulário de viagem. Funções puras: nada aqui salva ou publica.

export type DraftValue = string | number | boolean | string[];
export type TripDraft = Partial<Record<DraftKey, DraftValue>>;

export const DRAFT_LABELS = {
  title: 'Nome da viagem',
  headlineDisplay: 'Título do card',
  category: 'Categoria',
  description: 'Descrição',
  region: 'Estado',
  city: 'Cidade',
  startDateISO: 'Data de saída',
  endDateISO: 'Data de volta',
  departureTime: 'Horário de saída',
  departureTolerance: 'Tolerância de saída',
  returnTime: 'Horário de volta',
  scheduleInfo: 'Informações de horário',
  priceValue: 'Valor (R$)',
  priceUnit: 'Unidade do valor',
  free: 'Viagem gratuita',
  intensityClass: 'Intensidade',
  spotsLeft: 'Vagas',
  trailDistance: 'Distância',
  supportPoint: 'Ponto de apoio',
  supportPointInfo: 'Sobre o ponto de apoio',
  meetingCity: 'Cidade de embarque',
  meetingPoint: 'Local de embarque',
  meetingDetails: 'Detalhes do embarque',
  includes: 'O que está incluso',
  includedServices: 'Serviços inclusos',
  itinerary: 'Roteiro',
  routeNotes: 'Notas do percurso',
  importantInfo: 'Informações importantes',
} as const;

export type DraftKey = keyof typeof DRAFT_LABELS;
export const DRAFT_KEYS = Object.keys(DRAFT_LABELS) as DraftKey[];

type FormLike = Record<string, unknown>;

/** Campo "preenchido" = tem algo que a pessoa digitou. Valores iguais ao padrão do formulário novo contam como vazios. */
export function isFieldFilled(value: unknown, defaultValue?: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (defaultValue !== undefined && JSON.stringify(value) === JSON.stringify(defaultValue)) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return true;
}

export interface SuggestionRow {
  key: DraftKey;
  label: string;
  current: string;
  suggested: string;
  /** Já tem valor no formulário: só entra se a pessoa marcar. */
  hasCurrent: boolean;
}

function show(key: DraftKey, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(' • ') : '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if ((key === 'startDateISO' || key === 'endDateISO') && typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
  }
  if (key === 'priceValue' && typeof value === 'number') return value.toFixed(2).replace('.', ',');
  return String(value);
}

/** Linhas do resumo "campo atual x sugerido". Só campos que a IA sugeriu e que mudam algo. */
export function buildSuggestionRows(form: FormLike, draft: TripDraft, defaults: FormLike = {}): SuggestionRow[] {
  const rows: SuggestionRow[] = [];
  for (const key of DRAFT_KEYS) {
    const suggested = draft[key];
    if (!isFieldFilled(suggested)) continue;
    const hasCurrent = isFieldFilled(form[key], defaults[key]);
    if (hasCurrent && JSON.stringify(form[key]) === JSON.stringify(suggested)) continue;
    rows.push({
      key,
      label: DRAFT_LABELS[key],
      current: hasCurrent ? show(key, form[key]) : '—',
      suggested: show(key, suggested),
      hasCurrent,
    });
  }
  return rows;
}

/**
 * Aplica as sugestões escolhidas. Campo já preenchido só é trocado se estiver em `overwrite`
 * (a pessoa marcou); caso contrário, fica como está. Não altera o objeto original.
 */
export function applySuggestions<T extends FormLike>(
  form: T,
  draft: TripDraft,
  chosen: Iterable<DraftKey>,
  overwrite: Iterable<DraftKey> = [],
  defaults: FormLike = {},
): T {
  const allowed = new Set(overwrite);
  const next: FormLike = { ...form };
  for (const key of chosen) {
    if (!DRAFT_KEYS.includes(key)) continue;
    const suggested = draft[key];
    if (!isFieldFilled(suggested)) continue;
    if (isFieldFilled(form[key], defaults[key]) && !allowed.has(key)) continue;
    next[key] = Array.isArray(suggested) ? [...suggested] : suggested;
  }
  return next as T;
}
