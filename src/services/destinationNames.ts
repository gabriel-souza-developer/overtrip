import { normalizeForSearch } from '../utils/searchUtils.js';

// Nomes de destino vindos de lugares diferentes (planilha antiga, mapa do
// site, título de viagem) para o mesmo lugar: "Camping - Cachoeira da Manga
// - PB", "OVER RIDERS: CACHOEIRA DO PINGA - PB", "Olheiro de Pureza".

/** Mesmo lugar com nomes diferentes (chave normalizada → chave canônica). */
const ALIASES: Record<string, string> = {
  'olheiro de pureza': 'olho dagua de pureza',
};

/**
 * "Cachoeira da Mijona - Serra da Raiz - PB" → nome, cidade e UF;
 * "Lagoa Azul, Santa Rita - PB" → idem. Sem UF no fim, o texto todo vira o
 * nome (nunca adivinha cidade). "Camping - X", "Camping no X" e prefixos de
 * produto ("OVER RIDERS:", "Expedição") apontam para o próprio lugar X.
 */
export function parseDestinationLabel(label: string) {
  let text = label.replace(/,\s*\d{5}-\d{3}\s*$/, '').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:over\s+riders|expedi[cç][aã]o)\s*:?\s*/i, '').trim();
  let camping = false;
  const campingMatch = /^camping\s*(?:-\s*|(?:no|na|em)\s+)?(.+)$/i.exec(text);
  if (campingMatch) { camping = true; text = campingMatch[1].trim(); }
  let region: string | null = null;
  const ufMatch = /^(.*?)\s*[-,]\s*([A-Z]{2})$/.exec(text);
  if (ufMatch) { text = ufMatch[1].trim(); region = ufMatch[2]; }
  let name = text;
  let city: string | null = null;
  if (region) {
    const commaParts = text.split(',').map((part) => part.trim()).filter(Boolean);
    const dashParts = text.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
    if (commaParts.length >= 2) { name = commaParts[0]; city = commaParts[commaParts.length - 1]; }
    else if (dashParts.length === 2) { name = dashParts[0]; city = dashParts[1]; }
  }
  return { name, city, region, camping };
}

/** Chave para reconhecer o mesmo lugar: sem acento, caixa, pontuação, prefixos ou UF. */
export function destinationMatchKey(label: string): string {
  const key = normalizeForSearch(parseDestinationLabel(label).name).replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return ALIASES[key] ?? key;
}

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas']);

/** "CACHOEIRA DO PINGA" → "Cachoeira do Pinga" (títulos de viagem vêm em caixa alta). */
export function prettyPlaceName(name: string): string {
  if (name !== name.toLocaleUpperCase('pt-BR')) return name;
  return name.toLocaleLowerCase('pt-BR').split(' ').map((word, index) => (
    index > 0 && LOWER_WORDS.has(word) ? word : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
  )).join(' ');
}
