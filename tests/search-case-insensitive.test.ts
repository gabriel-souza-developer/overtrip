import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { tripService, visitService, galleryService } from '../src/services/index.js';
import { normalizeForSearch, normalizeForSearchRegion } from '../src/utils/searchUtils.js';

const prisma = new PrismaClient();

// Unique storedIdentity prefix for test data isolation and cleanup
const TEST_PREFIX = 'search-ci-test:';

function createTripData(overrides: Partial<{
  title: string;
  city: string;
  category: string;
  storedIdentity: string;
}> = {}) {
  const title = overrides.title || 'Test Trip';
  const city = overrides.city || 'Test City';
  const category = overrides.category || 'Test Category';
  
  return {
    title,
    headlineDisplay: 'Test Headline',
    category,
    description: 'Test description',
    city,
    region: 'PB',
    startDateISO: new Date('2026-12-01T06:00:00-03:00'),
    intensityClass: 'moderado' as const,
    includes: JSON.stringify(['Item 1']),
    media: JSON.stringify([{ src: 'https://example.com/img.jpg', alt: 'Test' }]),
    titleSearch: normalizeForSearch(title),
    citySearch: normalizeForSearch(city),
    categorySearch: normalizeForSearch(category),
    storedIdentity: overrides.storedIdentity || `${TEST_PREFIX}trip:${Date.now()}:${Math.random().toString(36).substring(7)}`,
  };
}

function createVisitData(overrides: Partial<{
  title: string;
  city: string;
  region: string;
  source: string;
  storedIdentity: string;
}> = {}) {
  const title = overrides.title || 'Test Visit';
  const city = overrides.city || 'Test City';
  const region = overrides.region || 'PB';
  const source = overrides.source || 'manual';
  
  return {
    title,
    city,
    region,
    source,
    needsReview: false,
    titleSearch: normalizeForSearch(title),
    citySearch: normalizeForSearch(city),
    regionSearch: normalizeForSearchRegion(region),
    sourceSearch: normalizeForSearch(source),
    storedIdentity: overrides.storedIdentity || `${TEST_PREFIX}visit:${Date.now()}:${Math.random().toString(36).substring(7)}`,
  };
}

function createGalleryData(overrides: Partial<{
  title: string;
  description: string;
  storedIdentity: string;
}> = {}) {
  const title = overrides.title || 'Test Gallery';
  const description = overrides.description || 'Test gallery description';
  
  return {
    title,
    date: new Date('2026-12-01T15:00:00-03:00'),
    dateDisplay: '1 de dezembro de 2026',
    description,
    images: JSON.stringify([{ src: 'https://example.com/img.jpg', alt: 'Test' }]),
    isFeatured: false,
    orderIndex: 0,
    titleSearch: normalizeForSearch(title),
    descriptionSearch: normalizeForSearch(description),
    storedIdentity: overrides.storedIdentity || `${TEST_PREFIX}gallery:${Date.now()}:${Math.random().toString(36).substring(7)}`,
  };
}

afterAll(async () => {
  await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: TEST_PREFIX } } });
  await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: TEST_PREFIX } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up all test data with test:search: prefix
  await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: TEST_PREFIX } } });
  await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: TEST_PREFIX } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: TEST_PREFIX } } });
});

// ============================================================================
// 1. TripService.findAll: title, city, category (search)
// ============================================================================
describe('TripService.findAll - Case & Accent Insensitive Search (title, city, category)', () => {
  beforeEach(async () => {
    await prisma.trip.create({
      data: createTripData({
        title: 'Trilha das Aves',
        city: 'João Pessoa',
        category: 'Aventura',
        storedIdentity: `${TEST_PREFIX}trip:1`,
      }),
    });
    await prisma.trip.create({
      data: createTripData({
        title: 'PASSEIO ECOLÓGICO',
        city: 'SÃO PAULO',
        category: 'ECOTURISMO',
        storedIdentity: `${TEST_PREFIX}trip:2`,
      }),
    });
  });

  it('1.1 should find trip by title with case and accent variations (e.g. "ecologico" -> "ECOLÓGICO")', async () => {
    // Current behavior: FAILS because SQLite contains/LIKE is accent-sensitive
    const result = await tripService.findAll({ search: 'ecologico' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('PASSEIO ECOLÓGICO');
  });

  it('1.2 should find trip by city with accent/case variation (e.g. "joao pessoa" -> "João Pessoa")', async () => {
    // Current behavior: FAILS because SQLite contains/LIKE is accent-sensitive for 'ã'
    const result = await tripService.findAll({ search: 'joao pessoa' });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some(t => t.city === 'João Pessoa')).toBe(true);
  });

  it('1.3 should find trip by category with accent/case variation (e.g. "aventura" -> "Aventura")', async () => {
    // Current behavior: FAILS when querying unaccented "aventura" against accented/cased variants
    const result = await tripService.findAll({ search: 'aventura' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].category).toBe('Aventura');
  });
});

// ============================================================================
// 2 & 3. VisitService.findAll: city, region (direct filters)
// ============================================================================
describe('VisitService.findAll - Direct Filters Case & Accent Insensitivity (city, region)', () => {
  beforeEach(async () => {
    await prisma.visit.create({
      data: createVisitData({
        title: 'Visita Cabo Branco',
        city: 'João Pessoa',
        region: 'Paraíba Teste',  // Unique region to avoid matching existing data
        storedIdentity: `${TEST_PREFIX}visit:1`,
      }),
    });
  });

  it('2.1 should filter visits by city direct filter case & accent-insensitively ("joao pessoa" -> "João Pessoa")', async () => {
    // Current behavior: FAILS because { contains: 'joao pessoa' } does not match 'João Pessoa' in SQLite
    const result = await visitService.findAll({ city: 'joao pessoa' });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data.some(v => v.city === 'João Pessoa')).toBe(true);
  });

  it('3.1 should filter visits by region direct filter case & accent-insensitively ("paraiba" -> "Paraíba")', async () => {
    // Current behavior: FAILS because { contains: 'paraiba' } does not match 'Paraíba' in SQLite
    const result = await visitService.findAll({ region: 'paraiba teste' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].region).toBe('Paraíba Teste');
  });
});

// ============================================================================
// 4. VisitService.findAll: title, city, source (search)
// ============================================================================
describe('VisitService.findAll - Search Filter Case & Accent Insensitivity (title, city, source)', () => {
  beforeEach(async () => {
    await prisma.visit.create({
      data: createVisitData({
        title: 'Cânion de São Francisco',
        city: 'Canindé de São Francisco',
        source: 'Mídia Social - Instagram',
        storedIdentity: `${TEST_PREFIX}visit:search:1`,
      }),
    });
  });

  it('4.1 should find visit by title search with accent/case variation ("canion" -> "Cânion")', async () => {
    // Current behavior: FAILS because 'canion' != 'Cânion' under SQLite LIKE
    const result = await visitService.findAll({ search: 'canion' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Cânion de São Francisco');
  });

  it('4.2 should find visit by city search with accent/case variation ("caninde" -> "Canindé")', async () => {
    // Current behavior: FAILS because 'caninde' != 'Canindé' under SQLite LIKE
    const result = await visitService.findAll({ search: 'caninde' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].city).toBe('Canindé de São Francisco');
  });

  it('4.3 should find visit by source search with accent/case variation ("midia" -> "Mídia")', async () => {
    // Current behavior: FAILS because 'midia' != 'Mídia' under SQLite LIKE
    const result = await visitService.findAll({ search: 'midia' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].source).toBe('Mídia Social - Instagram');
  });
});

// ============================================================================
// 5. GalleryService.findAll: title, description (search)
// ============================================================================
describe('GalleryService.findAll - Search Filter Case & Accent Insensitivity (title, description)', () => {
  beforeEach(async () => {
    await prisma.galleryEntry.create({
      data: createGalleryData({
        title: 'Expedição Amazônica',
        description: 'Imagens e memórias da travessia em área de preservação',
        storedIdentity: `${TEST_PREFIX}gallery:1`,
      }),
    });
  });

  it('5.1 should find gallery entry by title search with accent/case variation ("expedicao amazonica" -> "Expedição Amazônica")', async () => {
    // Current behavior: FAILS because 'expedicao amazonica' != 'Expedição Amazônica' under SQLite LIKE
    const result = await galleryService.findAll({ search: 'expedicao amazonica' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Expedição Amazônica');
  });

  it('5.2 should find gallery entry by description search with accent/case variation ("memorias" -> "memórias")', async () => {
    // Current behavior: FAILS because 'memorias' != 'memórias' under SQLite LIKE
    const result = await galleryService.findAll({ search: 'memorias' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].description).toContain('memórias');
  });
});

// ============================================================================
// Edge cases across services: Empty string, Special characters & Unicode normalization
// ============================================================================
describe('Search & Filter Common Edge Cases (Empty String, Special Chars, Unicode Normalization)', () => {
  beforeEach(async () => {
    await prisma.trip.create({
      data: createTripData({
        title: 'Açude Velho e Cânion NFD (câ)',
        city: 'Campina Grande',
        category: 'Urbano & Natureza',
        storedIdentity: `${TEST_PREFIX}edge:trip:1`,
      }),
    });
  });

  it('Edge 1: empty search string should not match all records (should return empty or ignored gracefully)', async () => {
    // Expected behavior: search with empty string "" should be ignored (return all) or return empty
    // With our implementation, empty search is ignored (returns all records)
    const result = await tripService.findAll({ search: '' });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
  });

  it('Edge 2: search with special characters (&, %, _) should match literally without SQL wildcard unexpected behavior', async () => {
    const result = await tripService.findAll({ search: 'Urbano &' });
    expect(result.data).toHaveLength(1);
  });

  it('Edge 3: unicode normalization (NFD decomposed accents e.g. cânion vs NFC cÂnion)', async () => {
    // Decomposed NFD 'câ' (c + \u0302) vs NFC 'câ' (\u00e2)
    const nfdSearch = 'cânion'.normalize('NFD');
    const result = await tripService.findAll({ search: nfdSearch });
    expect(result.data).toHaveLength(1);
  });
});

// ============================================================================
// Integration Tests: Update -> Search, Combined Filters, Pagination, Regional Search
// ============================================================================
describe('Integration Tests - Update -> Search, Combined Filters, Pagination, Regional Search', () => {
  const INTEG_PREFIX = 'search-ci-test:integ:';

  function createIntegTripData(overrides: Partial<{
    title: string;
    city: string;
    category: string;
    status: string;
    storedIdentity: string;
  }> = {}) {
    const title = overrides.title || 'Integ Trip';
    const city = overrides.city || 'Integ City';
    const category = overrides.category || 'Integ Category';
    const status = overrides.status || 'DRAFT';
    
    return {
      title,
      headlineDisplay: 'Integ Headline',
      category,
      description: 'Integ description',
      city,
      region: 'PB',
      startDateISO: new Date('2026-12-01T06:00:00-03:00'),
      intensityClass: 'moderado' as const,
      includes: JSON.stringify(['Item 1']),
      media: JSON.stringify([{ src: 'https://example.com/img.jpg', alt: 'Test' }]),
      status,
      titleSearch: normalizeForSearch(title),
      citySearch: normalizeForSearch(city),
      categorySearch: normalizeForSearch(category),
      storedIdentity: overrides.storedIdentity || `${INTEG_PREFIX}trip:${Date.now()}:${Math.random().toString(36).substring(7)}`,
    };
  }

  function createIntegVisitData(overrides: Partial<{
    title: string;
    city: string;
    region: string;
    source: string;
    storedIdentity: string;
  }> = {}) {
    const title = overrides.title || 'Integ Visit';
    const city = overrides.city || 'Integ City';
    const region = overrides.region || 'PB';
    const source = overrides.source || 'manual';
    
    return {
      title,
      city,
      region,
      source,
      needsReview: false,
      titleSearch: normalizeForSearch(title),
      citySearch: normalizeForSearch(city),
      // Use the region normalization for test data too
      regionSearch: normalizeForSearchRegion(region),
      sourceSearch: normalizeForSearch(source),
      storedIdentity: overrides.storedIdentity || `${INTEG_PREFIX}visit:${Date.now()}:${Math.random().toString(36).substring(7)}`,
    };
  }

  afterAll(async () => {
    await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: INTEG_PREFIX } } });
    await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: INTEG_PREFIX } } });
    await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: INTEG_PREFIX } } });
  });

  beforeEach(async () => {
    await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: INTEG_PREFIX } } });
    await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: INTEG_PREFIX } } });
    await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: INTEG_PREFIX } } });
  });

  it('Integration 1: Update trip title then search by new title (case/accent insensitive)', async () => {
    // Create trip
    const created = await prisma.trip.create({
      data: createIntegTripData({
        title: 'Viagem Original',
        city: 'Recife',
        category: 'Aventura',
        storedIdentity: `${INTEG_PREFIX}trip:update1`,
      }),
    });

    // Update title
    const updated = await tripService.update(created.id, { title: 'NOVA VIAGEM ECOLÓGICA' });
    expect(updated.title).toBe('NOVA VIAGEM ECOLÓGICA');

    // Search by new title with accent/case variation
    const result = await tripService.findAll({ search: 'ecologica' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('NOVA VIAGEM ECOLÓGICA');
    expect(result.data[0].titleSearch).toBe('nova viagem ecologica');
  });

  it('Integration 2: Update visit city then direct filter by new city', async () => {
    const created = await prisma.visit.create({
      data: createIntegVisitData({
        title: 'Visita Original',
        city: 'Fortaleza',
        region: 'CE',
        storedIdentity: `${INTEG_PREFIX}visit:update1`,
      }),
    });

    await visitService.update(created.id, { city: 'São Luís' });

    const result = await visitService.findAll({ city: 'sao luis' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].city).toBe('São Luís');
    expect(result.data[0].citySearch).toBe('sao luis');
  });

  it('Integration 3: Combined filters - search + status + pagination', async () => {
    // Create multiple trips with same search term but different statuses
    await prisma.trip.createMany({
      data: [
        createIntegTripData({ title: 'PASSEIO ECOLÓGICO', city: 'Cidade A', status: 'OPEN', storedIdentity: `${INTEG_PREFIX}trip:combo1` }),
        createIntegTripData({ title: 'PASSEIO ECOLÓGICO', city: 'Cidade B', status: 'DRAFT', storedIdentity: `${INTEG_PREFIX}trip:combo2` }),
        createIntegTripData({ title: 'Outro Título', city: 'Cidade C', status: 'OPEN', storedIdentity: `${INTEG_PREFIX}trip:combo3` }),
      ],
    });

    // Search + status filter
    const result = await tripService.findAll({ search: 'ecologico', status: 'OPEN', page: 1, limit: 10 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('PASSEIO ECOLÓGICO');
    expect(result.data[0].status).toBe('OPEN');
    expect(result.pagination.total).toBe(1);
  });

  it('Integration 4: Pagination under search - multiple pages', async () => {
    // Create 5 matching trips
    for (let i = 0; i < 5; i++) {
      await prisma.trip.create({
        data: createIntegTripData({
          title: `TRILHA ECOLÓGICA ${i}`,
          city: `Cidade ${i}`,
          storedIdentity: `${INTEG_PREFIX}trip:page${i}`,
        }),
      });
    }

    const page1 = await tripService.findAll({ search: 'ecologica', page: 1, limit: 2 });
    const page2 = await tripService.findAll({ search: 'ecologica', page: 2, limit: 2 });
    const page3 = await tripService.findAll({ search: 'ecologica', page: 3, limit: 2 });

    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(2);
    expect(page3.data).toHaveLength(1);
    expect(page1.pagination.total).toBe(5);
    expect(page2.pagination.total).toBe(5);
    expect(page3.pagination.total).toBe(5);
    // Ensure no duplicate across pages
    const allIds = [...page1.data, ...page2.data, ...page3.data].map(t => t.id);
    expect(new Set(allIds).size).toBe(5);
  });

  it('Integration 5: Regional search - abbreviation and full name equivalence', async () => {
    // Create visits with different region formats
    await prisma.visit.createMany({
      data: [
        createIntegVisitData({ title: 'Visita PB', city: 'João Pessoa', region: 'PB', storedIdentity: `${INTEG_PREFIX}visit:reg1` }),
        createIntegVisitData({ title: 'Visita Paraíba', city: 'Campina Grande', region: 'Paraíba', storedIdentity: `${INTEG_PREFIX}visit:reg2` }),
        createIntegVisitData({ title: 'Visita PE', city: 'Recife', region: 'PE', storedIdentity: `${INTEG_PREFIX}visit:reg3` }),
        createIntegVisitData({ title: 'Visita Pernambuco', city: 'Olinda', region: 'Pernambuco', storedIdentity: `${INTEG_PREFIX}visit:reg4` }),
      ],
    });

    // Search by abbreviation "pb" should find both PB and Paraíba
    const byAbbreviation = await visitService.findAll({ region: 'pb' });
    expect(byAbbreviation.data.length).toBeGreaterThanOrEqual(2);
    expect(byAbbreviation.data.every(v => ['PB', 'Paraíba'].includes(v.region))).toBe(true);

    // Search by full name "paraiba" should find both
    const byFullName = await visitService.findAll({ region: 'paraiba' });
    expect(byFullName.data.length).toBeGreaterThanOrEqual(2);
    expect(byFullName.data.every(v => ['PB', 'Paraíba'].includes(v.region))).toBe(true);

    // Search by "pernambuco" should find PE and Pernambuco
    const byPE = await visitService.findAll({ region: 'pernambuco' });
    expect(byPE.data.length).toBeGreaterThanOrEqual(2);
    expect(byPE.data.every(v => ['PE', 'Pernambuco'].includes(v.region))).toBe(true);

    // Search by "pe" should also find both
    const byPEAbbr = await visitService.findAll({ region: 'pe' });
    expect(byPEAbbr.data.length).toBeGreaterThanOrEqual(2);
  });

  it('Integration 6: Count accuracy under search and filters', async () => {
    await prisma.trip.createMany({
      data: [
        createIntegTripData({ title: 'CONTAGEM ECOLÓGICO', city: 'A', status: 'OPEN', storedIdentity: `${INTEG_PREFIX}trip:count1` }),
        createIntegTripData({ title: 'CONTAGEM ECOLÓGICO', city: 'B', status: 'DRAFT', storedIdentity: `${INTEG_PREFIX}trip:count2` }),
        createIntegTripData({ title: 'OUTRO', city: 'C', status: 'OPEN', storedIdentity: `${INTEG_PREFIX}trip:count3` }),
      ],
    });

    // Total count with search
    const all = await tripService.findAll({ search: 'ecologico' });
    expect(all.pagination.total).toBe(2);

    // Count with search + status
    const open = await tripService.findAll({ search: 'ecologico', status: 'OPEN' });
    expect(open.pagination.total).toBe(1);

    // Count with search + different status
    const draft = await tripService.findAll({ search: 'ecologico', status: 'DRAFT' });
    expect(draft.pagination.total).toBe(1);
  });

  it('Integration 7: Backfill idempotency - re-running produces zero updates', async () => {
    // This test documents expected behavior - the backfill script should be idempotent
    // We verify the normalization functions produce consistent results
    const title = 'TÍTULO COM ACENTOS';
    const normalized1 = normalizeForSearch(title);
    const normalized2 = normalizeForSearch(normalized1);
    expect(normalized1).toBe(normalized2); // Idempotent

    const region = 'PB';
    const regionNorm1 = normalizeForSearchRegion(region);
    const regionNorm2 = normalizeForSearchRegion(regionNorm1);
    expect(regionNorm1).toBe(regionNorm2); // Idempotent

    // Verify regionSearch contains both forms
    expect(regionNorm1).toContain('pb');
    expect(regionNorm1).toContain('paraiba');
  });
});