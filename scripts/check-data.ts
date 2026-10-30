import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Check existing trips
  const trips = await prisma.trip.findMany({ 
    select: { title: true, titleSearch: true, category: true, categorySearch: true }
  });
  console.log('Trips:', JSON.stringify(trips, null, 2));

  // Check visits
  const visits = await prisma.visit.findMany({ 
    select: { title: true, titleSearch: true, city: true, citySearch: true, region: true, regionSearch: true, source: true, sourceSearch: true }
  });
  console.log('Visits:', JSON.stringify(visits, null, 2));

  // Check gallery
  const gallery = await prisma.galleryEntry.findMany({ 
    select: { title: true, titleSearch: true, description: true, descriptionSearch: true }
  });
  console.log('Gallery:', JSON.stringify(gallery, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);