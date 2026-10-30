import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const migrations = await prisma.$queryRaw`SELECT * FROM _prisma_migrations ORDER BY finished_at`;
    console.log('Migrations:', JSON.stringify(migrations, null, 2));
  } catch (e) {
    console.log('Error querying _prisma_migrations:', e.message);
  }
  await prisma.$disconnect();
}

main().catch(console.error);