import { Estado } from './ibgeLocalidades';

/**
 * A trip/visit saved before this feature existed may hold a region value
 * that isn't one of the 27 official UFs (or isn't loaded yet). Appending it
 * as its own option keeps that record visible and re-savable instead of
 * silently losing it when the <select> only lists the official list.
 */
export function buildUfOptions(estados: Estado[], currentValue: string): Estado[] {
  if (!currentValue || estados.some(e => e.sigla === currentValue)) {
    return estados;
  }
  return [...estados, { sigla: currentValue, nome: currentValue }];
}

/**
 * The city belongs to the previously selected UF, so it is cleared only when
 * the user replaces a valid (known) UF with a different one. Picking a UF for
 * the first time (previous empty) or typing in the free-text fallback (the
 * previous value is not a known UF) must never wipe the city. Callers must
 * only invoke this from a user-driven onChange, never while loading a record.
 */
export function nextCityOnRegionChange(
  currentCity: string,
  previousRegion: string,
  nextRegion: string,
  previousIsKnownUf: boolean
): string {
  if (!previousIsKnownUf || !previousRegion) return currentCity;
  return previousRegion === nextRegion ? currentCity : '';
}

/**
 * Wrapping index for ArrowUp/ArrowDown over a combobox's suggestion list.
 * -1 means "no active item" (e.g. list just opened or has no matches).
 */
export function nextActiveIndex(currentIndex: number, itemCount: number, direction: 1 | -1): number {
  if (itemCount === 0) return -1;
  if (currentIndex === -1) return direction === 1 ? 0 : itemCount - 1;
  const next = currentIndex + direction;
  if (next < 0) return itemCount - 1;
  if (next >= itemCount) return 0;
  return next;
}
