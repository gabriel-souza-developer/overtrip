import { PrismaClient } from '@prisma/client';
import { normalizeForSearch, normalizeForSearchRegion } from '../src/utils/searchUtils.js';

const prisma = new PrismaClient();

async function backfillTrip() {
  console.log('Backfilling Trip search columns...');
  const trips = await prisma.trip.findMany({
    select: { id: true, title: true, city: true, category: true, titleSearch: true, citySearch: true, categorySearch: true }
  });

  let examined = 0;
  let updated = 0;
  let skipped = 0;

  // Use transaction for atomicity
  await prisma.$transaction(async (tx) => {
    for (const trip of trips) {
      examined++;
      const expectedTitleSearch = normalizeForSearch(trip.title);
      const expectedCitySearch = normalizeForSearch(trip.city);
      const expectedCategorySearch = normalizeForSearch(trip.category);

      // Only update if search columns are empty or diverge from source
      const needsUpdate = 
        trip.titleSearch !== expectedTitleSearch ||
        trip.citySearch !== expectedCitySearch ||
        trip.categorySearch !== expectedCategorySearch;

      if (needsUpdate) {
        await tx.trip.update({
          where: { id: trip.id },
          data: {
            titleSearch: expectedTitleSearch,
            citySearch: expectedCitySearch,
            categorySearch: expectedCategorySearch,
          }
        });
        updated++;
      } else {
        skipped++;
      }
    }
  });

  console.log(`Trip: examined=${examined}, updated=${updated}, skipped=${skipped}`);
}

async function backfillVisit() {
  console.log('Backfilling Visit search columns...');
  const visits = await prisma.visit.findMany({
    select: { id: true, title: true, city: true, region: true, source: true, titleSearch: true, citySearch: true, regionSearch: true, sourceSearch: true }
  });

  let examined = 0;
  let updated = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const visit of visits) {
      examined++;
      const expectedTitleSearch = normalizeForSearch(visit.title);
      const expectedCitySearch = normalizeForSearch(visit.city);
      const expectedRegionSearch = normalizeForSearchRegion(visit.region);
      const expectedSourceSearch = visit.source ? normalizeForSearch(visit.source) : '';

      const needsUpdate = 
        visit.titleSearch !== expectedTitleSearch ||
        visit.citySearch !== expectedCitySearch ||
        visit.regionSearch !== expectedRegionSearch ||
        visit.sourceSearch !== expectedSourceSearch;

      if (needsUpdate) {
        await tx.visit.update({
          where: { id: visit.id },
          data: {
            titleSearch: expectedTitleSearch,
            citySearch: expectedCitySearch,
            regionSearch: expectedRegionSearch,
            sourceSearch: expectedSourceSearch,
          }
        });
        updated++;
      } else {
        skipped++;
      }
    }
  });

  console.log(`Visit: examined=${examined}, updated=${updated}, skipped=${skipped}`);
}

async function backfillGalleryEntry() {
  console.log('Backfilling GalleryEntry search columns...');
  const entries = await prisma.galleryEntry.findMany({
    select: { id: true, title: true, description: true, titleSearch: true, descriptionSearch: true }
  });

  let examined = 0;
  let updated = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      examined++;
      const expectedTitleSearch = normalizeForSearch(entry.title);
      const expectedDescriptionSearch = normalizeForSearch(entry.description);

      const needsUpdate = 
        entry.titleSearch !== expectedTitleSearch ||
        entry.descriptionSearch !== expectedDescriptionSearch;

      if (needsUpdate) {
        await tx.galleryEntry.update({
          where: { id: entry.id },
          data: {
            titleSearch: expectedTitleSearch,
            descriptionSearch: expectedDescriptionSearch,
          }
        });
        updated++;
      } else {
        skipped++;
      }
    }
  });

  console.log(`GalleryEntry: examined=${examined}, updated=${updated}, skipped=${skipped}`);
}

async function main() {
  console.log('Starting search columns backfill (idempotent, transactional)...');
  
  await backfillTrip();
  await backfillVisit();
  await backfillGalleryEntry();
  
  console.log('Backfill completed!');
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });