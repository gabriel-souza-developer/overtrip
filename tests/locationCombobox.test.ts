import { describe, it, expect } from 'vitest';
import {
  buildUfOptions,
  nextCityOnRegionChange,
  nextActiveIndex,
} from '../frontend/src/lib/locationCombobox';

describe('buildUfOptions', () => {
  const estados = [
    { sigla: 'PB', nome: 'Paraíba' },
    { sigla: 'PE', nome: 'Pernambuco' },
  ];

  it('returns the list unchanged when the current value is already in it', () => {
    expect(buildUfOptions(estados, 'PB')).toEqual(estados);
  });

  it('returns the list unchanged when the current value is empty', () => {
    expect(buildUfOptions(estados, '')).toEqual(estados);
  });

  it('appends an extra option for a legacy value not present in the official list', () => {
    expect(buildUfOptions(estados, 'ZZ')).toEqual([
      ...estados,
      { sigla: 'ZZ', nome: 'ZZ' },
    ]);
  });

  it('does not duplicate the extra option when called again with the same value', () => {
    const withExtra = buildUfOptions(estados, 'ZZ');
    expect(buildUfOptions(withExtra, 'ZZ')).toEqual(withExtra);
  });
});

describe('nextCityOnRegionChange', () => {
  it('keeps the current city when the region is unchanged', () => {
    expect(nextCityOnRegionChange('Campina Grande', 'PB', 'PB')).toBe('Campina Grande');
  });

  it('clears the city when the region actually changes', () => {
    expect(nextCityOnRegionChange('Campina Grande', 'PB', 'PE')).toBe('');
  });

  it('keeps the city when the previous region was empty and a region is picked for the first time', () => {
    expect(nextCityOnRegionChange('', '', 'PB')).toBe('');
  });

  it('clears a prefilled city when a region is picked for the first time and city was already set', () => {
    expect(nextCityOnRegionChange('Recife', '', 'PE')).toBe('');
  });
});

describe('nextActiveIndex', () => {
  it('moves forward from -1 to the first item', () => {
    expect(nextActiveIndex(-1, 5, 1)).toBe(0);
  });

  it('moves backward from -1 to the last item', () => {
    expect(nextActiveIndex(-1, 5, -1)).toBe(4);
  });

  it('advances to the next item', () => {
    expect(nextActiveIndex(1, 5, 1)).toBe(2);
  });

  it('wraps around to the first item after the last', () => {
    expect(nextActiveIndex(4, 5, 1)).toBe(0);
  });

  it('wraps around to the last item before the first', () => {
    expect(nextActiveIndex(0, 5, -1)).toBe(4);
  });

  it('returns -1 when there are no items', () => {
    expect(nextActiveIndex(-1, 0, 1)).toBe(-1);
    expect(nextActiveIndex(2, 0, -1)).toBe(-1);
  });
});
