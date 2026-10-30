/**
 * Search utilities for case/accent-insensitive search in SQLite
 *
 * SQLite LIKE is case-sensitive for non-ASCII and accent-sensitive.
 * We store normalized (lowercase, diacritics removed) versions of searchable fields
 * in *_Search columns and search against those.
 */
export declare function normalizeForSearch(text: string): string;
/**
 * Normalize region for search - includes both abbreviation and full name
 * e.g., "PB" -> "pb paraiba", "Paraíba" -> "paraiba pb"
 */
export declare function normalizeForSearchRegion(region: string): string;
/**
 * Apply case/accent-insensitive search filter using normalized columns
 * Returns a Prisma where clause that searches the normalized _Search columns
 */
export declare function applySearchFilter(searchTerm: string | undefined, searchFields: string[]): Record<string, {
    contains: string;
}>[] | undefined;
/**
 * Apply case/accent-insensitive direct filter using normalized columns
 * For exact field filtering (e.g., city, region)
 */
export declare function applyDirectFilter(filterValue: string | undefined, searchField: string): Record<string, {
    contains: string;
}> | undefined;
/**
 * Build complete where clause with search filters
 */
export declare function buildSearchWhere<T extends Record<string, any>>(baseWhere: T, search: string | undefined, searchFields: string[], directFilters?: Record<string, string | undefined>): T;
//# sourceMappingURL=searchUtils.d.ts.map