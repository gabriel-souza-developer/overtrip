import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const trips = await prisma.trip.findMany({ take: 3, select: { id: true, title: true, titleSearch: true, city: true, citySearch: true } });
  console.log('Trips:', JSON.stringify(trips, null, 2));
  
  const visits = await prisma.visit.findMany({ take: 3, select: { id: true, title: true, titleSearch: true, city: true, citySearch: true } });
  console.log('Visits:', JSON.stringify(visits, null, 2));
  
  const gallery = await prisma.galleryEntry.findMany({ take: 3, select: { id: true, title: true, titleSearch: true, description: true, descriptionSearch: true } });
  console.log('Gallery:', JSON.stringify(gallery, null, 2));
  
  await prisma.$disconnect();
}

main().catch(console.error);