"use strict";
// Generate public JSON files for the OVERTRIP website
// Atomic writes with backup, validation before publishing
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJson = generateJson;
exports.disconnectPrisma = disconnectPrisma;
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let prismaInstance = null;
function getPrisma() {
    if (!prismaInstance) {
        prismaInstance = new client_1.PrismaClient();
    }
    return prismaInstance;
}
async function disconnectPrisma() {
    if (prismaInstance) {
        await prismaInstance.$disconnect();
        prismaInstance = null;
    }
}
function parseJsonField(value, fallback) {
    if (!value)
        return fallback;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function formatDateDisplay(dateStr) {
    if (!dateStr)
        return null;
    try {
        return new Date(dateStr).toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
        });
    }
    catch {
        return null;
    }
}
async function generateTripsJson() {
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
async function generateVisitsJson() {
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
        let images = parseJsonField(visit.images, null);
        if (!images || images.length === 0) {
            const galleryImages = visit.galleryEntries.flatMap(g => parseJsonField(g.images, []));
            if (galleryImages.length > 0)
                images = galleryImages;
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
async function generateGalleryJson() {
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
function writeAtomic(filePath, content) {
    const tempPath = `${filePath}.tmp`;
    const backupPath = `${filePath}.bak`;
    // Create backup if file exists
    if (fs_1.default.existsSync(filePath)) {
        fs_1.default.copyFileSync(filePath, backupPath);
    }
    // Write to temp file
    fs_1.default.writeFileSync(tempPath, content, 'utf-8');
    // Atomic rename
    fs_1.default.renameSync(tempPath, filePath);
    console.log(`✅ Written: ${filePath}`);
}
async function generateJson(outputDir) {
    const actualOutputDir = outputDir || (fs_1.default.existsSync(path_1.default.resolve(process.cwd(), 'public'))
        ? path_1.default.resolve(process.cwd(), 'public')
        : path_1.default.resolve(process.cwd(), '../public'));
    if (!fs_1.default.existsSync(actualOutputDir)) {
        fs_1.default.mkdirSync(actualOutputDir, { recursive: true });
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
    const tripsPath = path_1.default.join(actualOutputDir, 'trips.json');
    writeAtomic(tripsPath, JSON.stringify(trips, null, 2));
    const visitsPath = path_1.default.join(actualOutputDir, 'visited-places.json');
    writeAtomic(visitsPath, JSON.stringify(visits, null, 2));
    const galleryPath = path_1.default.join(actualOutputDir, 'gallery.json');
    writeAtomic(galleryPath, JSON.stringify(entries, null, 2));
    return { trips: trips.length, visits: visits.length, gallery: entries.length };
}
// No auto-execution on import - use generate-json-cli.ts for CLI execution
//# sourceMappingURL=generate-json.js.map