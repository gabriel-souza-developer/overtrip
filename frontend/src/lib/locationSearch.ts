export interface LocationResult {
  label: string;
  lat: number;
  lng: number;
  city?: string;
  region?: string;
}

const STATES: Record<string, string> = Object.fromEntries([
  ['Acre','AC'], ['Alagoas','AL'], ['Amapá','AP'], ['Amazonas','AM'], ['Bahia','BA'], ['Ceará','CE'],
  ['Distrito Federal','DF'], ['Espírito Santo','ES'], ['Goiás','GO'], ['Maranhão','MA'], ['Mato Grosso','MT'],
  ['Mato Grosso do Sul','MS'], ['Minas Gerais','MG'], ['Pará','PA'], ['Paraíba','PB'], ['Paraná','PR'],
  ['Pernambuco','PE'], ['Piauí','PI'], ['Rio de Janeiro','RJ'], ['Rio Grande do Norte','RN'],
  ['Rio Grande do Sul','RS'], ['Rondônia','RO'], ['Roraima','RR'], ['Santa Catarina','SC'],
  ['São Paulo','SP'], ['Sergipe','SE'], ['Tocantins','TO'],
].map(([name, uf]) => [name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), uf]));

/** Photon retorna coordenadas GeoJSON na ordem longitude, latitude. */
export function parseLocationResults(payload: unknown): LocationResult[] {
  if (!payload || typeof payload !== 'object' || !('features' in payload) || !Array.isArray(payload.features)) return [];
  return payload.features.flatMap((feature: any) => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const [lng, lat] = coordinates;
    if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90 || typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180) return [];
    const p = feature.properties || {};
    const label = [...new Set([p.name, p.street, p.city, p.county, p.state, p.country].filter((v): v is string => typeof v === 'string' && !!v.trim()))].join(', ');
    const state = typeof p.state === 'string' ? p.state.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';
    const region = STATES[state] || (Object.values(STATES).includes(state.toUpperCase()) ? state.toUpperCase() : undefined);
    const municipality = typeof p.city === 'string' && p.city.trim() ? p.city.trim() :
      (p.osm_value === 'municipality' && typeof p.name === 'string' ? p.name.trim() : '');
    const brazil = p.countrycode === 'BR';
    return [{ label: label || `${lat}, ${lng}`, lat, lng, ...(brazil && region && municipality ? { city: municipality, region } : {}) }];
  }).slice(0, 5);
}

export function locationMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
