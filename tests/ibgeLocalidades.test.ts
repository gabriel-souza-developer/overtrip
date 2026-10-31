import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseEstados,
  parseMunicipios,
  normalizeForSearch,
  filterMunicipios,
  debounce,
  createMunicipioCache,
  createEstadosCache,
  fetchEstados,
  fetchMunicipios,
} from '../frontend/src/lib/ibgeLocalidades';

describe('parseEstados', () => {
  it('parses a valid IBGE estados payload sorted by nome', () => {
    const raw = [
      { id: 25, sigla: 'PB', nome: 'Paraíba' },
      { id: 26, sigla: 'PE', nome: 'Pernambuco' },
      { id: 11, sigla: 'RO', nome: 'Rondônia' },
    ];
    expect(parseEstados(raw)).toEqual([
      { sigla: 'PB', nome: 'Paraíba' },
      { sigla: 'PE', nome: 'Pernambuco' },
      { sigla: 'RO', nome: 'Rondônia' },
    ]);
  });

  it('drops entries missing sigla or nome', () => {
    const raw = [
      { id: 1, sigla: 'PB', nome: 'Paraíba' },
      { id: 2, nome: 'Sem sigla' },
      { id: 3, sigla: 'XX' },
    ];
    expect(parseEstados(raw)).toEqual([{ sigla: 'PB', nome: 'Paraíba' }]);
  });

  it('returns an empty array when the payload is not an array', () => {
    expect(parseEstados(null)).toEqual([]);
    expect(parseEstados(undefined)).toEqual([]);
    expect(parseEstados({ error: 'offline' })).toEqual([]);
  });
});

describe('parseMunicipios', () => {
  it('parses a valid IBGE municipios payload into sorted city names', () => {
    const raw = [
      { id: 1, nome: 'João Pessoa' },
      { id: 2, nome: 'Campina Grande' },
      { id: 3, nome: 'Areia' },
    ];
    expect(parseMunicipios(raw)).toEqual(['Areia', 'Campina Grande', 'João Pessoa']);
  });

  it('drops entries without a usable nome', () => {
    const raw = [{ id: 1, nome: 'Areia' }, { id: 2 }, { id: 3, nome: '' }];
    expect(parseMunicipios(raw)).toEqual(['Areia']);
  });

  it('returns an empty array when the payload is not an array', () => {
    expect(parseMunicipios(null)).toEqual([]);
  });
});

describe('normalizeForSearch', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeForSearch('João Pessoa')).toBe('joao pessoa');
    expect(normalizeForSearch('CONDE')).toBe('conde');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeForSearch('  Areia  ')).toBe('areia');
  });
});

describe('filterMunicipios', () => {
  const municipios = ['João Pessoa', 'Campina Grande', 'Areia', 'Conde'];

  it('returns the full list when the query is empty', () => {
    expect(filterMunicipios(municipios, '')).toEqual(municipios);
  });

  it('filters case-insensitively and accent-insensitively by substring', () => {
    expect(filterMunicipios(municipios, 'joao')).toEqual(['João Pessoa']);
    expect(filterMunicipios(municipios, 'CAMPINA')).toEqual(['Campina Grande']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterMunicipios(municipios, 'recife')).toEqual([]);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only invokes the function once after the delay for rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced('a');
    debounced('b');
    debounced('c');

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('invokes again after a new delay window', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced('a');
    vi.advanceTimersByTime(300);
    debounced('b');
    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'a');
    expect(fn).toHaveBeenNthCalledWith(2, 'b');
  });

  it('never invokes the function once cancel() is called before the delay elapses', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced('a');
    debounced.cancel();
    vi.advanceTimersByTime(300);

    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel() is a no-op when nothing is pending', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    expect(() => debounced.cancel()).not.toThrow();
  });
});

describe('createMunicipioCache', () => {
  it('fetches municipios once per UF and caches the resolved result', async () => {
    const fetcher = vi.fn(async (uf: string) => [`${uf}-city-1`, `${uf}-city-2`]);
    const cache = createMunicipioCache(fetcher);

    const first = await cache.get('PB');
    const second = await cache.get('PB');

    expect(first).toEqual(['PB-city-1', 'PB-city-2']);
    expect(second).toEqual(['PB-city-1', 'PB-city-2']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent in-flight requests for the same UF', async () => {
    let resolveFn: (value: string[]) => void;
    const fetcher = vi.fn(() => new Promise<string[]>(resolve => { resolveFn = resolve; }));
    const cache = createMunicipioCache(fetcher);

    const call1 = cache.get('PE');
    const call2 = cache.get('PE');
    resolveFn!(['Recife']);

    await Promise.all([call1, call2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed fetch, so the next call retries', async () => {
    const fetcher = vi.fn(async () => null);
    const cache = createMunicipioCache(fetcher);

    const first = await cache.get('RO');
    const second = await cache.get('RO');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('treats UF case-insensitively as the same cache key', async () => {
    const fetcher = vi.fn(async (uf: string) => [uf]);
    const cache = createMunicipioCache(fetcher);

    await cache.get('pb');
    await cache.get('PB');

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('fetchEstados', () => {
  it('returns parsed estados when the request succeeds', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [{ sigla: 'PB', nome: 'Paraíba' }],
    })) as unknown as typeof fetch;

    const result = await fetchEstados(fetchImpl);
    expect(result).toEqual([{ sigla: 'PB', nome: 'Paraíba' }]);
  });

  it('falls back to null when the response is not ok', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    const result = await fetchEstados(fetchImpl);
    expect(result).toBeNull();
  });

  it('falls back to null when the network request throws', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const result = await fetchEstados(fetchImpl);
    expect(result).toBeNull();
  });

  it('falls back to null when the response is 200 but the parsed list is empty', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
    const result = await fetchEstados(fetchImpl);
    expect(result).toBeNull();
  });
});

describe('fetchMunicipios', () => {
  it('returns parsed municipios for a UF when the request succeeds', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [{ nome: 'João Pessoa' }],
    })) as unknown as typeof fetch;

    const result = await fetchMunicipios('PB', fetchImpl);
    expect(result).toEqual(['João Pessoa']);
  });

  it('falls back to null when the IBGE API is unreachable', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const result = await fetchMunicipios('PB', fetchImpl);
    expect(result).toBeNull();
  });

  it('falls back to null when the response is 200 but the parsed list is empty', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
    const result = await fetchMunicipios('PB', fetchImpl);
    expect(result).toBeNull();
  });
});

describe('createEstadosCache', () => {
  it('fetches once and caches the resolved result', async () => {
    const fetcher = vi.fn(async () => [{ sigla: 'PB', nome: 'Paraíba' }]);
    const cache = createEstadosCache(fetcher);

    const first = await cache.get();
    const second = await cache.get();

    expect(first).toEqual([{ sigla: 'PB', nome: 'Paraíba' }]);
    expect(second).toEqual([{ sigla: 'PB', nome: 'Paraíba' }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent in-flight requests', async () => {
    let resolveFn: (value: { sigla: string; nome: string }[]) => void;
    const fetcher = vi.fn(() => new Promise<{ sigla: string; nome: string }[]>(resolve => { resolveFn = resolve; }));
    const cache = createEstadosCache(fetcher);

    const call1 = cache.get();
    const call2 = cache.get();
    resolveFn!([{ sigla: 'PB', nome: 'Paraíba' }]);

    await Promise.all([call1, call2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed fetch, so the next call retries', async () => {
    const fetcher = vi.fn(async () => null);
    const cache = createEstadosCache(fetcher);

    const first = await cache.get();
    const second = await cache.get();

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
