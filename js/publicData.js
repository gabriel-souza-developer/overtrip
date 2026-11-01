/* ==========================================================================
   Galeria e mapa vindos do painel (API pública), com queda para a lista fixa.
   Funções puras e sem DOM, para poderem ser testadas.
   ========================================================================== */

const GALLERY_API_URL = "/api/public/gallery";
const DESTINATIONS_API_URL = "/api/public/destinations";
const PUBLIC_API_TIMEOUT_MS = 3000;

// Lê um endereço da API (com tempo limite). Devolve o array, ou null se falhar
// (erro de rede, HTTP != 2xx, tempo esgotado ou resposta que não é array).
// Array vazio é resposta válida.
const fetchPublicArray = async (fetchFn, url, { timeoutMs = PUBLIC_API_TIMEOUT_MS, warn = console.warn, label = url } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, { cache: "no-cache", signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error(`A resposta de ${url} não é um array válido.`);
    }

    return payload;
  } catch (error) {
    warn(`[OVERTRIP] ${label} indisponível (${error?.message || error}); usando a lista fixa do site.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// A memória em destaque vem primeiro (card grande); as demais por data decrescente.
// Sem destaque, fica só a ordem por data.
const orderGallery = (entries) =>
  [...entries].sort((a, b) => {
    const aFeatured = a.featured === true;
    const bFeatured = b.featured === true;
    if (aFeatured !== bFeatured) {
      return aFeatured ? -1 : 1;
    }
    return String(b.dateISO || "").localeCompare(String(a.dateISO || ""));
  });

// Galeria do painel; se a API falhar, a lista fixa (fallback).
const resolveGallery = async (fetchFn, fallback, options = {}) => {
  const fromApi = await fetchPublicArray(fetchFn, GALLERY_API_URL, { ...options, label: "API da galeria" });
  const source = fromApi ?? fallback;
  return orderGallery(source);
};

const coordinateKey = (place) => `${Number(place.lat).toFixed(3)},${Number(place.lng).toFixed(3)}`;

const hasCoordinates = (place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lng);

// Agrupa por coordenada (3 casas, ~110 m): visitas ao mesmo lugar em datas
// diferentes viram um destino só, com todas as datas.
const groupByCoordinate = (places) => {
  const byCoordinate = new Map();

  places.filter(hasCoordinates).forEach((visit) => {
    const key = coordinateKey(visit);

    if (!byCoordinate.has(key)) {
      byCoordinate.set(key, { title: visit.title, place: visit.place, lat: visit.lat, lng: visit.lng, visits: [visit] });
    } else {
      byCoordinate.get(key).visits.push(visit);
    }
  });

  return byCoordinate;
};

// Lista fixa + API. Na mesma coordenada o dado da API prevalece (e substitui o
// destino fixo naquela posição). Nada some do mapa até ser revisado no painel.
const mergeDestinations = (fixedPlaces, apiPlaces) => {
  const fixed = groupByCoordinate(fixedPlaces);
  const fromApi = groupByCoordinate(Array.isArray(apiPlaces) ? apiPlaces : []);
  const merged = new Map(fixed);

  fromApi.forEach((destination, key) => merged.set(key, destination));

  return Array.from(merged.values());
};

const loadApiDestinations = (fetchFn, options = {}) =>
  fetchPublicArray(fetchFn, DESTINATIONS_API_URL, { ...options, label: "API de destinos" });

export {
  GALLERY_API_URL,
  DESTINATIONS_API_URL,
  fetchPublicArray,
  orderGallery,
  resolveGallery,
  groupByCoordinate,
  mergeDestinations,
  loadApiDestinations,
};
