export interface Estado {
  sigla: string;
  nome: string;
}

const IBGE_ESTADOS_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome';
const DIACRITICS_PATTERN = /[̀-ͯ]/g;

function ibgeMunicipiosUrl(uf: string): string {
  return `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`;
}

/**
 * The 'region' field in the DB/trips.json stores the UF sigla (e.g. 'PB'),
 * so parsing keeps both sigla and nome but callers persist only the sigla.
 */
export function parseEstados(raw: unknown): Estado[] {
  if (!Array.isArray(raw)) return [];
  const estados: Estado[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { sigla, nome } = item as { sigla?: unknown; nome?: unknown };
    if (typeof sigla === 'string' && sigla && typeof nome === 'string' && nome) {
      estados.push({ sigla, nome });
    }
  }
  return estados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function parseMunicipios(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const nomes: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { nome } = item as { nome?: unknown };
    if (typeof nome === 'string' && nome) nomes.push(nome);
  }
  return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS_PATTERN, '').toLowerCase().trim();
}

export function filterMunicipios(municipios: string[], query: string): string[] {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return municipios;
  return municipios.filter(m => normalizeForSearch(m).includes(normalizedQuery));
}

export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  cancel(): void;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = ((...args: Args) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  }) as Debounced<Args>;
  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}

/**
 * Caches resolved municipio lists per UF and dedupes concurrent in-flight
 * requests. A failed fetch (null) is never cached, so the next call retries
 * instead of being stuck on a transient IBGE outage.
 */
export function createMunicipioCache(fetchMunicipios: (uf: string) => Promise<string[] | null>) {
  const cache = new Map<string, string[]>();
  const pending = new Map<string, Promise<string[] | null>>();

  return {
    get(uf: string): Promise<string[] | null> {
      const key = uf.toUpperCase();
      const cached = cache.get(key);
      if (cached) return Promise.resolve(cached);

      const inFlight = pending.get(key);
      if (inFlight) return inFlight;

      const request = fetchMunicipios(key).then(result => {
        pending.delete(key);
        if (result) cache.set(key, result);
        return result;
      });
      pending.set(key, request);
      return request;
    },
    clear(): void {
      cache.clear();
      pending.clear();
    },
  };
}

export async function fetchEstados(fetchImpl: typeof fetch = fetch): Promise<Estado[] | null> {
  try {
    const res = await fetchImpl(IBGE_ESTADOS_URL);
    if (!res.ok) return null;
    const parsed = parseEstados(await res.json());
    // A 200 with an empty list is as unusable as a network failure (there
    // are always 27 UFs) — treat it as a failure so it's never cached.
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchMunicipios(uf: string, fetchImpl: typeof fetch = fetch): Promise<string[] | null> {
  try {
    const res = await fetchImpl(ibgeMunicipiosUrl(uf));
    if (!res.ok) return null;
    const parsed = parseMunicipios(await res.json());
    // Every UF has at least one municipio, so an empty list is a failure too.
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Caches the resolved estados list in memory (success only — a failed
 * fetch is never cached, so the next render retries instead of being
 * stuck on a transient IBGE outage) and dedupes concurrent requests.
 */
export function createEstadosCache(fetchEstadosFn: () => Promise<Estado[] | null>) {
  let cached: Estado[] | null = null;
  let pending: Promise<Estado[] | null> | null = null;

  return {
    get(): Promise<Estado[] | null> {
      if (cached) return Promise.resolve(cached);
      if (pending) return pending;

      pending = fetchEstadosFn().then(result => {
        pending = null;
        if (result) cached = result;
        return result;
      });
      return pending;
    },
    clear(): void {
      cached = null;
      pending = null;
    },
  };
}
