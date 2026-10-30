#!/usr/bin/env tsx
// CLI entry point for generating public JSON files
import { generateJson, disconnectPrisma } from './generate-json.js';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🔄 Generating public JSON files...\n');

  try {
    const result = await generateJson();
    
    console.log('\n🎉 All JSON files generated successfully!');
    console.log(`📁 Output directory: ${fs.existsSync(path.resolve(process.cwd(), 'public')) ? path.resolve(process.cwd(), 'public') : path.resolve(process.cwd(), '../public')}`);
    console.log(`   Trips: ${result.trips}`);
    console.log(`   Visits: ${result.visits}`);
    console.log(`   Gallery: ${result.gallery}`);

  } catch (error) {
    console.error('\n❌ Generation failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await disconnectPrisma();
  }
}

main();