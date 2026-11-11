import { afterEach, describe, expect, it, vi } from 'vitest';

describe('carregamento antecipado de viagens públicas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('não repete a consulta quando a tentativa antecipada já falhou', async () => {
    vi.stubGlobal('window', { __tripsRequest: Promise.resolve(null) });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const { getTripsLoadError, loadTrips } = await import('../js/data.js');

    expect(await loadTrips()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(getTripsLoadError()).toBeInstanceOf(Error);
  });

  it('trata uma resposta antecipada vazia como sucesso, não como falha', async () => {
    vi.stubGlobal('window', { __tripsRequest: Promise.resolve([]) });
    const { getTripsLoadError, loadTrips } = await import('../js/data.js');

    expect(await loadTrips()).toEqual([]);
    expect(getTripsLoadError()).toBeNull();
  });
});
