// Generate public JSON files for the OVERTRIP website
// Atomic writes with backup, validation before publishing

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

let prismaInstance: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

interface PublicTrip {
  id: string;
  title: string;
  headlineDisplay: string | null;
  category: string;
  description: string;
  city: string;
  region: string;
  startDateISO: string;
  endDateISO: string | null;
  departureTime: string | null;
  departureTolerance: string | null;
  returnTime: string | null;
  scheduleInfo: string | null;
  scheduleTBD: boolean;
  priceValue: number | null;
  priceDisplay: string | null;
  priceUnit: string;
  free: boolean;
  intensityClass: string;
  spotsLeft: number | null;
  trailDistance: string | null;
  supportPoint: string | null;
  supportPointInfo: string | null;
  meetingCity: string | null;
  meetingPoint: string | null;
  meetingDetails: string | null;
  meetingMapsQuery: string | null;
  includes: string[];
  includesHighlight: string | null;
  includedServices: string[] | null;
  itinerary: string[] | null;
  routeNotes: string[] | null;
  importantInfo: string[] | null;
  media: Array<{ src: string; alt: string; focus?: string; type?: 'image' | 'video' }>;
  buttonLabel: string;
  buttonClass: string;
  status: string;
  availabilitySchema: string;
  departures: Array<{
    id: string;
    time: string;
    place: string;
    city: string;
    mapsUrl: string | null;
    mapsQuery: string | null;
    orderIndex: number;
  }>;
}

interface PublicVisit {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  dateDisplay: string | null;
  city: string;
  region: string;
  lat: number | null;
  lng: number | null;
  images: Array<{ src: string; alt: string }> | null;
  tripId: string | null;
  tripTitle: string | null;
  needsReview: boolean;
  source: string | null;
}

interface PublicGalleryEntry {
  id: string;
  title: string;
  date: string;
  dateDisplay: string;
  description: string;
  images: Array<{ src: string; alt: string }>;
  tripId: string | null;
  tripTitle: string | null;
  visitId: string | null;
  visitTitle: string | null;
  isFeatured: boolean;
  orderIndex: number;
}

function parseJsonField<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function formatDateDisplay(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return null;
  }
}

async function generateTripsJson(): Promise<PublicTrip[]> {
  const prisma = getPrisma();
  const trips = await prisma.trip.findMany({
    where: { status: 'OPEN' }, // Only published trips
    include: {
      departures: { orderBy: { orderIndex: 'asc' } },
    },
    orderBy: { startDateISO: 'asc' },
  });

  return trips.map(trip => ({
    id: trip.id,
    title: trip.title,
    headlineDisplay: trip.headlineDisplay,
    category: trip.category,
    description: trip.description,
    city: trip.city,
    region: trip.region,
    startDateISO: trip.startDateISO.toISOString(),
    endDateISO: trip.endDateISO?.toISOString() || null,
    departureTime: trip.departureTime,
    departureTolerance: trip.departureTolerance,
    returnTime: trip.returnTime,
    scheduleInfo: trip.scheduleInfo,
    scheduleTBD: trip.scheduleTBD,
    priceValue: trip.priceValue,
    priceDisplay: trip.priceDisplay,
    priceUnit: trip.priceUnit,
    free: trip.free,
    intensityClass: trip.intensityClass,
    spotsLeft: trip.spotsLeft,
    trailDistance: trip.trailDistance,
    supportPoint: trip.supportPoint,
    supportPointInfo: trip.supportPointInfo,
    meetingCity: trip.meetingCity,
    meetingPoint: trip.meetingPoint,
    meetingDetails: trip.meetingDetails,
    meetingMapsQuery: trip.meetingMapsQuery,
    includes: parseJsonField(trip.includes, []),
    includesHighlight: trip.includesHighlight,
    includedServices: parseJsonField(trip.includedServices, null),
    itinerary: parseJsonField(trip.itinerary, null),
    routeNotes: parseJsonField(trip.routeNotes, null),
    importantInfo: parseJsonField(trip.importantInfo, null),
    media: parseJsonField(trip.media, []),
    buttonLabel: trip.buttonLabel,
    buttonClass: trip.buttonClass,
    status: trip.status,
    availabilitySchema: trip.availabilitySchema,
    departures: trip.departures.map(d => ({
      id: d.id,
      time: d.time,
      place: d.place,
      city: d.city,
      mapsUrl: d.mapsUrl,
      mapsQuery: d.mapsQuery,
      orderIndex: d.orderIndex,
    })),
  }));
}

async function generateVisitsJson(): Promise<PublicVisit[]> {
  const prisma = getPrisma();
  const visits = await prisma.visit.findMany({
    where: { needsReview: false }, // Only reviewed visits
    include: {
      trip: { select: { id: true, title: true } },
      galleryEntries: { select: { images: true } },
    },
    orderBy: { date: 'desc' },
  });

  return visits.map(visit => {
    // Get images from gallery entries if visit has no images
    let images = parseJsonField<Array<{ src: string; alt: string }>>(visit.images as unknown as string, null);
    if (!images || images.length === 0) {
      const galleryImages = visit.galleryEntries.flatMap(g => parseJsonField<Array<{ src: string; alt: string }>>(g.images as unknown as string, []));
      if (galleryImages.length > 0) images = galleryImages;
    }

    return {
      id: visit.id,
      title: visit.title,
      description: visit.description,
      date: visit.date?.toISOString() || null,
      dateDisplay: visit.date ? formatDateDisplay(visit.date.toISOString()) : null,
      city: visit.city,
      region: visit.region,
      lat: visit.lat,
      lng: visit.lng,
      images,
      tripId: visit.tripId,
      tripTitle: visit.trip?.title || null,
      needsReview: visit.needsReview,
      source: visit.source,
    };
  }).filter(v => v.lat !== null && v.lng !== null); // Only visits with valid coordinates for map pins
}

async function generateGalleryJson(): Promise<PublicGalleryEntry[]> {
  const prisma = getPrisma();
  const entries = await prisma.galleryEntry.findMany({
    include: {
      trip: { select: { id: true, title: true } },
      visit: { select: { id: true, title: true } },
    },
    orderBy: [{ isFeatured: 'desc' }, { orderIndex: 'asc' }, { date: 'desc' }],
  });

  return entries.map(entry => ({
    id: entry.id,
    title: entry.title,
    date: entry.date.toISOString(),
    dateDisplay: entry.dateDisplay,
    description: entry.description,
    images: parseJsonField(entry.images, []),
    tripId: entry.tripId,
    tripTitle: entry.trip?.title || null,
    visitId: entry.visitId,
    visitTitle: entry.visit?.title || null,
    isFeatured: entry.isFeatured,
    orderIndex: entry.orderIndex,
  }));
}

function writeAtomic(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;

  // Create backup if file exists
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath);
  }

  // Write to temp file
  fs.writeFileSync(tempPath, content, 'utf-8');

  // Atomic rename
  fs.renameSync(tempPath, filePath);

  console.log(`✅ Written: ${filePath}`);
}

export async function generateJson(outputDir?: string): Promise<{
  trips: number;
  visits: number;
  gallery: number;
}> {
  const actualOutputDir = outputDir || (fs.existsSync(path.resolve(process.cwd(), 'public')) 
    ? path.resolve(process.cwd(), 'public') 
    : path.resolve(process.cwd(), '../public'));

  if (!fs.existsSync(actualOutputDir)) {
    fs.mkdirSync(actualOutputDir, { recursive: true });
  }

  // Generate all JSON data
  const trips = await generateTripsJson();
  const visits = await generateVisitsJson();
  const entries = await generateGalleryJson();

  // Validate data
  const invalidTrips = trips.filter(t => !t.title || !t.city || !t.startDateISO);
  if (invalidTrips.length > 0) {
    throw new Error(`${invalidTrips.length} trips missing required fields`);
  }

  const galleryWithoutImages = entries.filter(g => !g.images || g.images.length === 0);
  if (galleryWithoutImages.length > 0) {
    throw new Error(`${galleryWithoutImages.length} gallery entries missing images`);
  }

  // Write files atomically
  const tripsPath = path.join(actualOutputDir, 'trips.json');
  writeAtomic(tripsPath, JSON.stringify(trips, null, 2));

  const visitsPath = path.join(actualOutputDir, 'visited-places.json');
  writeAtomic(visitsPath, JSON.stringify(visits, null, 2));

  const galleryPath = path.join(actualOutputDir, 'gallery.json');
  writeAtomic(galleryPath, JSON.stringify(entries, null, 2));

  return { trips: trips.length, visits: visits.length, gallery: entries.length };
}

export { disconnectPrisma };

// No auto-execution on import - use generate-json-cli.ts for CLI execution