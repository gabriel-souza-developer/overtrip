import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tables = ['Trip', 'Visit', 'GalleryEntry'];
  for (const table of tables) {
    const cols = await prisma.$queryRawUnsafe(`PRAGMA table_info('${table}');`);
    console.log(`=== ${table} columns ===`);
    cols.forEach(c => console.log(c.name, c.type, c.notnull, c.dflt_value, c.pk));
    
    const idxs = await prisma.$queryRawUnsafe(`PRAGMA index_list('${table}');`);
    console.log(`=== ${table} indexes ===`);
    idxs.forEach(i => console.log(i.name, i.unique, i.origin));
  }
  
  // Check for _prisma_migrations
  try {
    const migrations = await prisma.$queryRawUnsafe(`SELECT * FROM _prisma_migrations ORDER BY finished_at;`);
    console.log('=== _prisma_migrations ===', JSON.stringify(migrations, null, 2));
  } catch (e) {
    console.log('=== _prisma_migrations === TABLE DOES NOT EXIST');
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);