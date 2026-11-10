import { describe, expect, it } from 'vitest';
import { locationMapUrl, parseLocationResults } from '../frontend/src/lib/locationSearch';

describe('pesquisa de localização', () => {
  it('interpreta longitude e latitude na ordem GeoJSON e ignora coordenadas inválidas', () => {
    const results = parseLocationResults({ features: [
      { geometry: { coordinates: [-34.9, -7.1] }, properties: { name: 'Praia', city: 'Lucena', state: 'Paraíba' } },
      { geometry: { coordinates: [200, 10] }, properties: { name: 'Inválido' } },
      { geometry: { coordinates: ['-34', '-7'] }, properties: {} },
    ] });
    expect(results).toEqual([{ label: 'Praia, Lucena, Paraíba', lat: -7.1, lng: -34.9 }]);
    expect(locationMapUrl(results[0].lat, results[0].lng)).toContain('mlat=-7.1&mlon=-34.9');
  });

  it('preenche cidade e UF somente quando o resultado brasileiro identifica ambos', () => {
    const results = parseLocationResults({ features: [
      { geometry: { coordinates: [-34.8, -7.3] }, properties: { name: 'Praia', city: 'Conde', state: 'Paraíba', countrycode: 'BR' } },
      { geometry: { coordinates: [-34.9, -7.2] }, properties: { name: 'Praia', county: 'Outro lugar', state: 'Paraíba', countrycode: 'BR' } },
      { geometry: { coordinates: [-34.7, -7.4] }, properties: { name: 'Lugar', city: 'Cidade', state: 'Paraíba', countrycode: 'XX' } },
    ] });
    expect(results[0]).toMatchObject({ city: 'Conde', region: 'PB' });
    expect(results[1]).not.toHaveProperty('city');
    expect(results[2]).not.toHaveProperty('region');
  });
});
