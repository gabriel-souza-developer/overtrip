import { PrismaClient } from '@prisma/client';
import { tripService, visitService, galleryService } from '../src/services/index.js';
import { normalizeForSearch } from '../src/utils/searchUtils.js';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Testing Search Functionality ===\n');
  
  // Test 1: Trip search - "joao pessoa" should find "João Pessoa"
  console.log('Test 1: Trip search "joao pessoa" -> "João Pessoa"');
  const tripResult = await tripService.findAll({ search: 'joao pessoa' });
  console.log(`  Found ${tripResult.data.length} trips`);
  tripResult.data.forEach(t => console.log(`  - ${t.title} (${t.city})`));
  
  // Test 2: Trip search - "ecologico" should find "ECOLÓGICO"
  console.log('\nTest 2: Trip search "ecologico" -> "ECOLÓGICO"');
  const tripResult2 = await tripService.findAll({ search: 'ecologico' });
  console.log(`  Found ${tripResult2.data.length} trips`);
  tripResult2.data.forEach(t => console.log(`  - ${t.title} (${t.category})`));
  
  // Test 3: Visit search - "canion" should find "Cânion"
  console.log('\nTest 3: Visit search "canion" -> "Cânion"');
  const visitResult = await visitService.findAll({ search: 'canion' });
  console.log(`  Found ${visitResult.data.length} visits`);
  visitResult.data.forEach(v => console.log(`  - ${v.title} (${v.city})`));
  
  // Test 4: Visit direct filter city - "joao pessoa" -> "João Pessoa"
  console.log('\nTest 4: Visit city filter "joao pessoa" -> "João Pessoa"');
  const visitCityResult = await visitService.findAll({ city: 'joao pessoa' });
  console.log(`  Found ${visitCityResult.data.length} visits`);
  visitCityResult.data.forEach(v => console.log(`  - ${v.title} (${v.city})`));
  
  // Test 5: Visit direct filter region - "paraiba" -> "Paraíba"
  console.log('\nTest 5: Visit region filter "paraiba" -> "Paraíba"');
  const visitRegionResult = await visitService.findAll({ region: 'paraiba' });
  console.log(`  Found ${visitRegionResult.data.length} visits`);
  visitRegionResult.data.forEach(v => console.log(`  - ${v.title} (${v.region})`));
  
  // Test 6: Gallery search - "expedicao amazonica" -> "Expedição Amazônica"
  console.log('\nTest 6: Gallery search "expedicao amazonica" -> "Expedição Amazônica"');
  const galleryResult = await galleryService.findAll({ search: 'expedicao amazonica' });
  console.log(`  Found ${galleryResult.data.length} gallery entries`);
  galleryResult.data.forEach(g => console.log(`  - ${g.title}`));
  
  // Test 7: Gallery search - "memorias" -> "memórias"
  console.log('\nTest 7: Gallery search "memorias" -> "memórias"');
  const galleryResult2 = await galleryService.findAll({ search: 'memorias' });
  console.log(`  Found ${galleryResult2.data.length} gallery entries`);
  galleryResult2.data.forEach(g => console.log(`  - ${g.title}: ${g.description.substring(0, 50)}...`));
  
  // Test 8: Case variations - "RIO" should find "Rio"
  console.log('\nTest 8: Trip search "RIO" -> "Rio"');
  const tripRio = await tripService.findAll({ search: 'rio' });
  console.log(`  Found ${tripRio.data.length} trips`);
  tripRio.data.forEach(t => console.log(`  - ${t.title} (${t.city})`));
  
  // Test 9: Empty search (should return all or be ignored)
  console.log('\nTest 9: Empty search "" (should be ignored)');
  const tripEmpty = await tripService.findAll({ search: '' });
  console.log(`  Found ${tripEmpty.data.length} trips (expected: all)`);
  
  // Test 10: Normalize function test
  console.log('\nTest 10: normalizeForSearch function');
  console.log(`  "João Pessoa" -> "${normalizeForSearch('João Pessoa')}"`);
  console.log(`  "ECOLÓGICO" -> "${normalizeForSearch('ECOLÓGICO')}"`);
  console.log(`  "Cânion" -> "${normalizeForSearch('Cânion')}"`);
  console.log(`  "memórias" -> "${normalizeForSearch('memórias')}"`);
  console.log(`  "São Paulo" -> "${normalizeForSearch('São Paulo')}"`);
  console.log(`  "NFD cânion" -> "${normalizeForSearch('cânion'.normalize('NFD'))}"`);
  
  await prisma.$disconnect();
}

main().catch(console.error);