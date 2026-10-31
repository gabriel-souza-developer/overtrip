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
 * The city belongs to the previously selected UF, so it must be cleared
 * whenever the user actually changes the region — otherwise a stale pair
 * like Campina Grande/PE can be saved and reach the public site. Callers
 * must only invoke this from a user-driven onChange, never while loading
 * a record (which sets region and city together from the server).
 */
export function nextCityOnRegionChange(currentCity: string, previousRegion: string, nextRegion: string): string {
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
