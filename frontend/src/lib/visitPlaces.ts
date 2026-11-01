// Destinos já visitados para escolher no cadastro. Funções puras, testadas em tests/visitPlaces.test.ts.
import { normalizeForSearch } from './ibgeLocalidades';

export interface VisitPlace {
  key: string;
  title: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  /** "Nome — Cidade/UF" */
  label: string;
}

interface VisitLike {
  title: string;
  city: string;
  region: string;
  lat: number | null;
  lng: number | null;
}

/** Um destino por coordenada (5 casas ≈ 1 m). Visitas sem latitude/longitude ficam de fora. */
export function groupVisitPlaces(visits: VisitLike[]): VisitPlace[] {
  const byKey = new Map<string, VisitPlace>();
  for (const v of visits) {
    if (typeof v.lat !== 'number' || typeof v.lng !== 'number') continue;
    const key = `${v.lat.toFixed(5)},${v.lng.toFixed(5)}`;
    if (byKey.has(key)) continue;
    const where = [v.city, v.region].filter(Boolean).join('/');
    byKey.set(key, { key, title: v.title, city: v.city, region: v.region, lat: v.lat, lng: v.lng, label: where ? `${v.title} — ${where}` : v.title });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export function filterPlaces(places: VisitPlace[], query: string, max = 8): VisitPlace[] {
  const q = normalizeForSearch(query);
  return (q ? places.filter(p => normalizeForSearch(p.label).includes(q)) : places).slice(0, max);
}

/** Percorre todas as páginas (100 por vez) de uma listagem. */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ data: T[]; pagination: { totalPages: number } }>,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetchPage(page);
    all.push(...res.data);
    totalPages = res.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return all;
}
