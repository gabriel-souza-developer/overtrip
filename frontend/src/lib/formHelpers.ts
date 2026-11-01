// Funções puras usadas pelos formulários do painel (testadas em tests/formHelpers.test.ts).

/** A API exige `alt` como texto e o site público o usa: sem descrição, usa o título do registro. */
export function fillMissingAlt<T extends { alt: string }>(items: T[], fallback: string): T[] {
  const text = fallback.trim() || 'Foto';
  return items.map(item => ({ ...item, alt: item.alt.trim() || text }));
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  headlineDisplay: 'Título do card',
  category: 'Categoria',
  description: 'Descrição',
  city: 'Cidade',
  region: 'Estado/Região',
  startDateISO: 'Data de início',
  endDateISO: 'Data de fim',
  departureTime: 'Horário de saída',
  returnTime: 'Horário de retorno',
  priceValue: 'Valor',
  priceDisplay: 'Preço como aparece no site',
  priceUnit: 'Unidade do preço',
  spotsLeft: 'Vagas restantes',
  meetingMapsQuery: 'Endereço para o Google Maps',
  buttonLabel: 'Texto do botão',
  buttonClass: 'Estilo do botão',
  media: 'Fotos',
  images: 'Fotos',
  departures: 'Pontos de partida',
  dateDisplay: 'Data como aparece no site',
  date: 'Data',
  status: 'Situação',
  email: 'E-mail',
  password: 'Senha',
};

const SUB_LABELS: Record<string, string> = {
  src: 'link', alt: 'descrição', time: 'horário', place: 'local', city: 'cidade', mapsUrl: 'link do Google Maps',
};

export function fieldLabel(path: string): string {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return 'Formulário';
  const base = FIELD_LABELS[parts[0]] ?? parts[0];
  if (parts.length === 1) return base;
  const idx = Number(parts[1]);
  if (Number.isInteger(idx)) {
    const item = parts[0] === 'media' || parts[0] === 'images' ? `Foto ${idx + 1}` : `${base} (item ${idx + 1})`;
    const sub = parts[2] ? SUB_LABELS[parts[2]] ?? parts[2] : '';
    return sub ? `${item}, ${sub}` : item;
  }
  return base;
}

function translateMessage(message: string): string {
  const m = message.toLowerCase();
  if (m === 'required') return 'preencha este campo';
  if (m.includes('at least 1 character')) return 'preencha este campo';
  if (m.includes('invalid url')) return 'o link não é válido';
  if (m.includes('invalid datetime') || m.includes('invalid date')) return 'data inválida';
  if (m.includes('expected number')) return 'informe um número';
  if (m.includes('greater than or equal')) return 'o número é menor que o permitido';
  if (m.includes('invalid enum')) return 'escolha uma das opções';
  if (m.includes('invalid email')) return 'e-mail inválido';
  if (m === 'invalid' || m.startsWith('invalid ')) return 'valor inválido';
  return message;
}

interface ApiErrorBody {
  error?: string;
  details?: unknown;
}

/** Transforma a resposta de erro da API em português simples, dizendo o que corrigir. */
export function translateApiError(body: ApiErrorBody): string {
  const details = Array.isArray(body.details) ? body.details : [];
  const lines = details
    .filter((d): d is { field?: string; message?: string } => !!d && typeof d === 'object' && typeof (d as { message?: unknown }).message === 'string')
    .map(d => `${fieldLabel(d.field ?? '')}: ${translateMessage(d.message!)}`);
  if (lines.length > 0) return `Corrija para salvar: ${Array.from(new Set(lines)).join('; ')}.`;
  if (!body.error || body.error === 'Dados de entrada inválidos') {
    return body.error ? 'Alguns dados estão incorretos. Confira os campos e tente de novo.' : 'Algo deu errado. Tente novamente.';
  }
  return body.error;
}

export function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Mantém "Preço como aparece no site" em dia com o "Valor".
 * Só troca o texto se ele estiver vazio ou for o preço automático do valor anterior;
 * texto escrito pelo agente é preservado. Valor vazio ou zero não gera preço.
 */
export function syncPriceDisplay(prevValue: number | null, nextValue: number | null, display: string): string {
  const current = display.trim();
  const wasAuto = current === '' || (!!prevValue && prevValue > 0 && current === formatBRL(prevValue));
  if (!wasAuto) return display;
  return nextValue && nextValue > 0 ? formatBRL(nextValue) : '';
}
