import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages, filterPlaces, groupVisitPlaces } from '../frontend/src/lib/visitPlaces';

describe('destinos já visitados', () => {
  it('agrupa visitas nas mesmas coordenadas e ignora registros sem coordenadas', () => {
    const places = groupVisitPlaces([
      { title: 'Cachoeira', city: 'Areia', region: 'PB', lat: -6.96, lng: -35.69 },
      { title: 'Outra visita', city: 'Areia', region: 'PB', lat: -6.96, lng: -35.69 },
      { title: 'Sem coordenadas', city: 'Bananeiras', region: 'PB', lat: null, lng: null },
    ]);
    expect(places).toHaveLength(1);
    expect(places[0].label).toBe('Cachoeira — Areia/PB');
  });

  it('filtra por nome, cidade e estado sem diferenciar acentos ou caixa', () => {
    const places = groupVisitPlaces([{ title: 'Cachoeira do Pinga', city: 'Areia', region: 'PB', lat: -6.96, lng: -35.69 }]);
    expect(filterPlaces(places, 'cachoeira')).toHaveLength(1);
    expect(filterPlaces(places, 'AREIA/pb')).toHaveLength(1);
  });

  it('busca todas as páginas da API', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      data: [page], pagination: { totalPages: 3 },
    }));
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});
