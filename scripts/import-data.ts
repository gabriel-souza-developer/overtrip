/**
 * Import Data Script
 * Imports data from trips.json, VISITED_PLACES (js/map.js), GALLERY (js/data.js)
 * Idempotent: uses storedIdentity to avoid duplicates
 * No automatic associations between visits and trips
 */

// Force tsx to register itself for ESM imports
require('tsx');

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

console.log('🚀 Import script started!');

const prisma = new PrismaClient();

interface ImportStats {
  trips: { created: number; updated: number; skipped: number };
  visits: { created: number; updated: number; skipped: number };
  gallery: { created: number; updated: number; skipped: number };
  errors: string[];
}

function extractVisitedPlaces(): any[] {
  const mapJsPath = path.join(process.cwd(), 'js', 'map.js');
  const content = fs.readFileSync(mapJsPath, 'utf-8');
  
  // Extract VISITED_PLACES array using regex
  const match = content.match(/const VISITED_PLACES\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error('VISITED_PLACES not found in js/map.js');
  }
  
  // Parse the JavaScript array - we need to evaluate it carefully
  // Since it's a complex JS object, we'll use a Function constructor
  try {
    const places = eval(`(${match[1]})`);
    return places;
  } catch (e) {
    throw new Error(`Failed to parse VISITED_PLACES: ${e}`);
  }
}

function extractGallery(): any[] {
  const dataJsPath = path.join(process.cwd(), 'js', 'data.js');
  const content = fs.readFileSync(dataJsPath, 'utf-8');
  
  const match = content.match(/const GALLERY\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error('GALLERY not found in js/data.js');
  }
  
  try {
    const gallery = eval(`(${match[1]})`);
    return gallery;
  } catch (e) {
    throw new Error(`Failed to parse GALLERY: ${e}`);
  }
}

function parseBrazilianDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Handle formats like "28 de maio de 2023", "15 de agosto de 2026"
  const monthMap: Record<string, number> = {
    'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3,
    'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7,
    'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
  };
  
  const match = dateStr.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = monthMap[match[2].toLowerCase()];
    const year = parseInt(match[3], 10);
    
    if (month !== undefined) {
      return new Date(year, month, day, 12, 0, 0); // noon to avoid DST issues
    }
  }
  
  // Try ISO format
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]), 12, 0, 0);
  }
  
  console.warn(`Could not parse date: ${dateStr}`);
  return null;
}

function extractCityRegion(place: string): { city: string; region: string } {
  // Format: "Cidade - UF"
  const match = place.match(/(.+)\s*-\s*([A-Z]{2})$/);
  if (match) {
    return { city: match[1].trim(), region: match[2].trim() };
  }
  return { city: place.trim(), region: 'PB' };
}

function mapTripFromJson(trip: any, index: number) {
  const storedIdentity = `trips_json:${index}`;
  
  return {
    storedIdentity,
    title: trip.title,
    headlineDisplay: trip.headlineDisplay || null,
    category: trip.category,
    description: trip.description,
    city: trip.city,
    region: trip.region,
    startDateISO: new Date(trip.startDateISO),
    endDateISO: trip.endDateISO ? new Date(trip.endDateISO) : null,
    departureTime: trip.departureTime || null,
    departureTolerance: trip.departureTolerance || null,
    returnTime: trip.returnTime || null,
    scheduleInfo: trip.scheduleInfo || null,
    scheduleTBD: trip.scheduleTBD || false,
    priceValue: trip.priceValue ? parseFloat(trip.priceValue) : null,
    priceDisplay: trip.priceDisplay || null,
    priceUnit: trip.priceUnit || 'por pessoa',
    free: trip.free || false,
    intensityClass: trip.intensityClass?.toLowerCase() || 'moderado',
    spotsLeft: trip.spotsLeft || null,
    trailDistance: trip.trailDistance || null,
    supportPoint: trip.supportPoint || null,
    supportPointInfo: trip.supportPointInfo || null,
    meetingCity: trip.meetingCity || null,
    meetingPoint: trip.meetingPoint || null,
    meetingDetails: trip.meetingDetails || null,
    meetingMapsQuery: trip.meetingMapsQuery || null,
    includes: JSON.stringify(trip.includes || []),
    includesHighlight: trip.includesHighlight || null,
    includedServices: JSON.stringify(trip.includedServices || null),
    itinerary: JSON.stringify(trip.itinerary || null),
    routeNotes: JSON.stringify(trip.routeNotes || null),
    importantInfo: JSON.stringify(trip.importantInfo || null),
    media: JSON.stringify(trip.media || []),
    buttonLabel: trip.buttonLabel || 'Quero viajar',
    buttonClass: trip.buttonClass || 'button-dark',
    status: trip.status?.toUpperCase() || 'OPEN',
    availabilitySchema: trip.availabilitySchema || 'https://schema.org/InStock',
  };
}

function mapDepartures(tripId: string | null, departures: any[]) {
  return departures?.map((dep: any, index: number) => {
    const item: any = {
      time: dep.time,
      place: dep.place,
      city: dep.city,
      mapsUrl: dep.mapsUrl || null,
      mapsQuery: dep.mapsQuery || null,
      orderIndex: index,
    };
    if (tripId) {
      item.tripId = tripId;
    }
    return item;
  }) || [];
}

function mapVisitFromVisitedPlaces(place: any, index: number) {
  const storedIdentity = `visited_places_hardcoded:${index}`;
  const { city, region } = extractCityRegion(place.place);

  return {
    storedIdentity,
    tripId: null, // NEVER auto-associate
    title: place.title,
    description: null,
    date: place.date ? parseBrazilianDate(place.date) : null,
    city,
    region,
    lat: place.lat !== undefined ? place.lat : null,
    lng: place.lng !== undefined ? place.lng : null,
    images: JSON.stringify([]), // VISITED_PLACES doesn't have images
    source: 'visited_places_hardcoded',
    needsReview: true,
    notes: 'Importado de VISITED_PLACES hardcoded (js/map.js). Trip correspondente NÃO associada automaticamente. Revisar manualmente.',
  };
}

function mapVisitFromGallery(entry: any, index: number) {
  const storedIdentity = `gallery_hardcoded:${index}`;

  // Try to extract city/region from title
  let city = 'Desconhecido';
  let region = 'PB';

  const titleMatch = entry.title.match(/^(.+?)\s*-\s*([A-Z]{2})$/);
  if (titleMatch) {
    city = titleMatch[1].trim();
    region = titleMatch[2].trim();
  } else {
    // Try to extract from description or known patterns
    const cityPatterns = [
      'Lucena', 'Conde', 'Bonito', 'Barra de Santana', 'Pilões',
      'Matinhas', 'Bananeiras', 'Pureza', 'Cabedelo', 'João Pessoa',
      'Areia', 'Baía da Traição', 'Rio Tinto', 'Queimadas',
      'Santa Rita', 'Boa Vista', 'Pocinhos', 'Campina Grande'
    ];
    for (const c of cityPatterns) {
      if (entry.title.includes(c)) {
        city = c;
        break;
      }
    }
  }

  return {
    storedIdentity,
    tripId: null, // NEVER auto-associate
    title: entry.title,
    description: entry.description || null,
    date: entry.dateISO ? parseBrazilianDate(entry.dateISO) : null,
    city,
    region,
    lat: null, // NO fake coordinates
    lng: null, // NO fake coordinates
    images: JSON.stringify(entry.images || []),
    source: 'gallery_hardcoded',
    needsReview: true,
    notes: 'Importado de GALLERY hardcoded (js/data.js). Memória órfã - trip não encontrada em trips.json. Coordenadas não disponíveis. Revisar manualmente.',
  };
}

function mapGalleryEntry(entry: any, index: number) {
  const storedIdentity = `gallery_hardcoded:${index}`;

  return {
    storedIdentity,
    title: entry.title,
    date: entry.dateISO ? parseBrazilianDate(entry.dateISO) || new Date() : new Date(),
    dateDisplay: entry.date,
    description: entry.description,
    images: JSON.stringify(entry.images || []),
    tripId: null, // OPTIONAL - will be associated manually if needed
    visitId: null, // OPTIONAL
    isFeatured: index === 0, // First entry is featured
    orderIndex: index,
    source: 'gallery_hardcoded',
  };
}

async function createImportSnapshot(tripsJson: any[], visitedPlaces: any[], gallery: any[]) {
  const label = `import-${new Date().toISOString()}`;
  
  await prisma.importSnapshot.create({
    data: {
      label,
      tripsJson: JSON.stringify(tripsJson),
      visitedPlaces: JSON.stringify(visitedPlaces),
      gallery: JSON.stringify(gallery),
    }
  });
  
  console.log(`📦 Import snapshot created: ${label}`);
}

async function importAll(): Promise<ImportStats> {
  const stats: ImportStats = {
    trips: { created: 0, updated: 0, skipped: 0 },
    visits: { created: 0, updated: 0, skipped: 0 },
    gallery: { created: 0, updated: 0, skipped: 0 },
    errors: [],
  };
  
  try {
    // 1. Load source data
    console.log('📂 Loading source data...');
    const tripsJson = JSON.parse(fs.readFileSync('trips.json', 'utf-8'));
    const visitedPlaces = extractVisitedPlaces();
    const gallery = extractGallery();
    
    console.log(`   - trips.json: ${tripsJson.length} trips`);
    console.log(`   - VISITED_PLACES: ${visitedPlaces.length} entries`);
    console.log(`   - GALLERY: ${gallery.length} entries`);
    
    // 2. Create snapshot
    await createImportSnapshot(tripsJson, visitedPlaces, gallery);
    
    // 3. Import Trips (with departures)
    console.log('\n🚌 Importing trips...');
    for (let i = 0; i < tripsJson.length; i++) {
      const tripData = tripsJson[i];
      const storedIdentity = `trips_json:${i}`;
      
      try {
        const existing = await prisma.trip.findUnique({
          where: { storedIdentity },
        });
        
        if (existing) {
          // Update existing
          await prisma.trip.update({
            where: { storedIdentity },
            data: mapTripFromJson(tripData, i),
          });
          
          // Update departures
          await prisma.tripDeparture.deleteMany({ where: { tripId: existing.id } });
          if (tripData.departures?.length) {
            await prisma.tripDeparture.createMany({
              data: mapDepartures(existing.id, tripData.departures),
            });
          }
          
          stats.trips.updated++;
          console.log(`   ✅ Updated trip: ${tripData.title}`);
        } else {
          // Create new
          const trip = await prisma.trip.create({
            data: {
              ...mapTripFromJson(tripData, i),
              departures: {
                create: mapDepartures(null, tripData.departures || []), // tripId will be set by Prisma
              },
            },
          });
          
          stats.trips.created++;
          console.log(`   ✅ Created trip: ${tripData.title}`);
        }
      } catch (e) {
        const err = `Failed to import trip ${i} (${tripData.title}): ${e}`;
        stats.errors.push(err);
        console.error(`   ❌ ${err}`);
      }
    }
    
    // 4. Import Visits from VISITED_PLACES
    console.log('\n📍 Importing visits from VISITED_PLACES...');
    for (let i = 0; i < visitedPlaces.length; i++) {
      const place = visitedPlaces[i];
      const storedIdentity = `visited_places_hardcoded:${i}`;
      
      try {
        const existing = await prisma.visit.findUnique({
          where: { storedIdentity },
        });
        
        const visitData = mapVisitFromVisitedPlaces(place, i);
        
        if (existing) {
          await prisma.visit.update({
            where: { storedIdentity },
            data: visitData,
          });
          stats.visits.updated++;
          console.log(`   ✅ Updated visit: ${place.title}`);
        } else {
          await prisma.visit.create({ data: visitData });
          stats.visits.created++;
          console.log(`   ✅ Created visit: ${place.title}`);
        }
      } catch (e) {
        const err = `Failed to import visit ${i} (${place.title}): ${e}`;
        stats.errors.push(err);
        console.error(`   ❌ ${err}`);
      }
    }
    
    // 5. Import Visits from GALLERY (orphan memories)
    console.log('\n🖼️  Importing visits from GALLERY (orphan memories)...');
    for (let i = 0; i < gallery.length; i++) {
      const entry = gallery[i];
      const storedIdentity = `gallery_hardcoded:${i}`;
      
      try {
        const existing = await prisma.visit.findUnique({
          where: { storedIdentity },
        });
        
        const visitData = mapVisitFromGallery(entry, i);
        
        if (existing) {
          await prisma.visit.update({
            where: { storedIdentity },
            data: visitData,
          });
          stats.visits.updated++;
        } else {
          await prisma.visit.create({ data: visitData });
          stats.visits.created++;
          console.log(`   ✅ Created orphan visit: ${entry.title}`);
        }
      } catch (e) {
        const err = `Failed to import gallery visit ${i} (${entry.title}): ${e}`;
        stats.errors.push(err);
        console.error(`   ❌ ${err}`);
      }
    }
    
    // 6. Import Gallery Entries
    console.log('\n🖼️  Importing gallery entries...');
    for (let i = 0; i < gallery.length; i++) {
      const entry = gallery[i];
      const storedIdentity = `gallery_hardcoded:${i}`;
      
      try {
        const existing = await prisma.galleryEntry.findUnique({
          where: { storedIdentity },
        });
        
        const galleryData = mapGalleryEntry(entry, i);
        
        if (existing) {
          await prisma.galleryEntry.update({
            where: { storedIdentity },
            data: galleryData,
          });
          stats.gallery.updated++;
        } else {
          await prisma.galleryEntry.create({ data: galleryData });
          stats.gallery.created++;
          console.log(`   ✅ Created gallery entry: ${entry.title}`);
        }
      } catch (e) {
        const err = `Failed to import gallery entry ${i} (${entry.title}): ${e}`;
        stats.errors.push(err);
        console.error(`   ❌ ${err}`);
      }
    }
    
  } catch (e) {
    stats.errors.push(`Fatal error: ${e}`);
    console.error(`💥 Fatal error: ${e}`);
  }
  
  return stats;
}

async function validateImport(stats: ImportStats) {
  console.log('\n🔍 Validating import...');
  
  const tripsCount = await prisma.trip.count();
  const visitsCount = await prisma.visit.count();
  const galleryCount = await prisma.galleryEntry.count();
  const needsReviewCount = await prisma.visit.count({ where: { needsReview: true } });
  const withCoordsCount = await prisma.visit.count({ where: { lat: { not: null }, lng: { not: null } } });
  const withoutCoordsCount = await prisma.visit.count({ where: { OR: [{ lat: null }, { lng: null }] } });
  
  console.log(`\n📊 Import Summary:`);
  console.log(`   Trips: ${tripsCount} total (${stats.trips.created} created, ${stats.trips.updated} updated)`);
  console.log(`   Visits: ${visitsCount} total (${stats.visits.created} created, ${stats.visits.updated} updated)`);
  console.log(`   Gallery: ${galleryCount} total (${stats.gallery.created} created, ${stats.gallery.updated} updated)`);
  console.log(`   Visits needing review: ${needsReviewCount}`);
  console.log(`   Visits with coordinates: ${withCoordsCount}`);
  console.log(`   Visits WITHOUT coordinates: ${withoutCoordsCount}`);
  
  // Validate expected counts
  const expected = {
    trips: 4,
    visitsFromPlaces: 34,
    visitsFromGallery: 7,
    gallery: 7,
  };
  
  console.log(`\n✅ Validation:`);
  console.log(`   Trips: ${tripsCount === expected.trips ? 'PASS' : 'FAIL'} (expected ${expected.trips}, got ${tripsCount})`);
  console.log(`   Visits: ${visitsCount === (expected.visitsFromPlaces + expected.visitsFromGallery) ? 'PASS' : 'FAIL'} (expected ${expected.visitsFromPlaces + expected.visitsFromGallery}, got ${visitsCount})`);
  console.log(`   Gallery: ${galleryCount === expected.gallery ? 'PASS' : 'FAIL'} (expected ${expected.gallery}, got ${galleryCount})`);
  
  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors (${stats.errors.length}):`);
    stats.errors.forEach(e => console.log(`   - ${e}`));
  }
  
  return stats.errors.length === 0;
}

async function main() {
  console.log('🚀 Starting OVERTRIP data import...\n');
  
  console.log('DEBUG: main() called');
  const stats = await importAll();
  console.log('DEBUG: importAll completed');
  const success = await validateImport(stats);
  console.log('DEBUG: validateImport completed');
  
  await prisma.$disconnect();
  
  if (success && stats.errors.length === 0) {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Import completed with errors!');
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error('💥 Unhandled error:', e);
  await prisma.$disconnect();
  process.exit(1);
});