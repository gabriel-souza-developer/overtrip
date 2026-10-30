/**
 * Search utilities for case/accent-insensitive search in SQLite
 * 
 * SQLite LIKE is case-sensitive for non-ASCII and accent-sensitive.
 * We store normalized (lowercase, diacritics removed) versions of searchable fields
 * in *_Search columns and search against those.
 */

// Brazilian state abbreviation to full name mapping for regional search
const REGION_MAP: Record<string, string> = {
  'ac': 'acre',
  'al': 'alagoas',
  'ap': 'amapa',
  'am': 'amazonas',
  'ba': 'bahia',
  'ce': 'ceara',
  'df': 'distrito federal',
  'es': 'espirito santo',
  'go': 'goias',
  'ma': 'maranhao',
  'mt': 'mato grosso',
  'ms': 'mato grosso do sul',
  'mg': 'minas gerais',
  'pa': 'para',
  'pb': 'paraiba',
  'pr': 'parana',
  'pe': 'pernambuco',
  'pi': 'piaui',
  'rj': 'rio de janeiro',
  'rn': 'rio grande do norte',
  'rs': 'rio grande do sul',
  'ro': 'rondonia',
  'rr': 'roraima',
  'sc': 'santa catarina',
  'sp': 'sao paulo',
  'se': 'sergipe',
  'to': 'tocantins',
};

export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Normalize region for search - includes both abbreviation and full name
 * e.g., "PB" -> "pb paraiba", "Paraíba" -> "paraiba pb"
 */
export function normalizeForSearchRegion(region: string): string {
  const normalized = normalizeForSearch(region);
  // If it's a known abbreviation, append full name
  if (REGION_MAP[normalized]) {
    return `${normalized} ${REGION_MAP[normalized]}`;
  }
  // If it's a known full name, find and prepend abbreviation
  const abbreviation = Object.entries(REGION_MAP).find(([, full]) => full === normalized)?.[0];
  if (abbreviation) {
    return `${abbreviation} ${normalized}`;
  }
  // Unknown region, return as-is
  return normalized;
}

/**
 * Apply case/accent-insensitive search filter using normalized columns
 * Returns a Prisma where clause that searches the normalized _Search columns
 */
export function applySearchFilter(
  searchTerm: string | undefined,
  searchFields: string[]
): Record<string, { contains: string }>[] | undefined {
  if (!searchTerm || !searchTerm.trim()) {
    return undefined;
  }
  
  const normalized = normalizeForSearch(searchTerm);
  
  // If after normalization the term is empty, return undefined (no search filter)
  if (!normalized) {
    return undefined;
  }
  
  return searchFields.map(field => ({
    [field]: { contains: normalized }
  }));
}

/**
 * Apply case/accent-insensitive direct filter using normalized columns
 * For exact field filtering (e.g., city, region)
 */
export function applyDirectFilter(
  filterValue: string | undefined,
  searchField: string
): Record<string, { contains: string }> | undefined {
  if (!filterValue || !filterValue.trim()) {
    return undefined;
  }
  
  const normalized = normalizeForSearch(filterValue);
  
  // If after normalization the term is empty, return undefined
  if (!normalized) {
    return undefined;
  }
  
  return { [searchField]: { contains: normalized } };
}

/**
 * Build complete where clause with search filters
 */
export function buildSearchWhere<T extends Record<string, any>>(
  baseWhere: T,
  search: string | undefined,
  searchFields: string[],
  directFilters: Record<string, string | undefined> = {}
): T {
  const where: Record<string, any> = { ...baseWhere };
  
  // Apply search filter
  const searchClauses = applySearchFilter(search, searchFields);
  if (searchClauses) {
    where.OR = searchClauses;
  }
  
  // Apply direct filters
  for (const [field, value] of Object.entries(directFilters)) {
    const filterClause = applyDirectFilter(value, field);
    if (filterClause) {
      where[field] = filterClause[field];
    }
  }
  
  return where as T;
}