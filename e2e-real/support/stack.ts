import { join, resolve } from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Todos os caminhos usados pela API pertencem a este processo de teste.
const directory = process.env.OVERTRIP_E2E_TEMP_DIR;
const platformOnly = process.env.OVERTRIP_E2E_PLATFORM_ONLY === '1';
if (!directory) throw new Error('Diretório temporário de teste não informado');
process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'e2e-isolated-secret-never-used-in-production';
process.env.CORS_ORIGIN = 'http://127.0.0.1:4391';
process.env.UPLOADS_DIR = join(directory, 'uploads');
process.env.DOCUMENT_STORAGE_DIR = join(directory, 'documents');
process.env.OVERTRIP_E2E_MOCKS = '0';

let api: Server | undefined;
let platformApi: Server | undefined;
let vite: ChildProcess | undefined;
let prisma: import('@prisma/client').PrismaClient | undefined;
let closing = false;
async function cleanup() {
  if (closing) return;
  closing = true;
  vite?.kill('SIGTERM');
  if (api?.listening) await new Promise<void>(resolveClose => api!.close(() => resolveClose()));
  if (platformApi?.listening) await new Promise<void>(resolveClose => platformApi!.close(() => resolveClose()));
  await prisma?.$disconnect();
}

async function main() {
  execFileSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = await import('bcryptjs');
  prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const operator = await prisma.user.create({ data: { email: 'e2e@example.test', passwordHash: await bcrypt.default.hash('senha-e2e-123', 4), role: 'admin' } });
  const organization = await prisma.organization.create({ data: { name: 'Pousada fictícia E2E', slug: 'pousada-e2e', niche: 'pousada' } });
  await prisma.membership.create({ data: { userId: operator.id, organizationId: organization.id, role: 'owner' } });
  if (platformOnly) {
    const second = await prisma.user.create({ data: { email: 'outra-e2e@example.test', passwordHash: await bcrypt.default.hash('senha-e2e-123', 4), role: 'user' } });
    const otherOrg = await prisma.organization.create({ data: { name: 'Outra pousada E2E', slug: 'outra-pousada-e2e', niche: 'pousada' } });
    await prisma.membership.create({ data: { userId: second.id, organizationId: otherOrg.id, role: 'owner' } });
  }
  await prisma.trip.create({ data: {
    title: 'Viagem fictícia E2E', category: 'Teste', description: 'Viagem de teste',
    city: 'Lucena', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'),
    intensityClass: 'light', includes: '[]', media: '[]', storedIdentity: 'e2e-real-trip',
  } });
  if (!platformOnly) {
    const { default: app } = await import('../../src/app.js');
    api = await new Promise<Server>(resolveListen => {
      const server = app.listen(0, '127.0.0.1', () => resolveListen(server));
    });
  }
  // Apenas neste teste as duas APIs usam sessão e banco temporário iguais;
  // ambientes reais precisam de banco, segredo e domínio separados.
  const { default: platformApp } = await import('../../src/platformApp.js');
  platformApi = await new Promise<Server>(resolveListen => {
    const server = platformApp.listen(0, '127.0.0.1', () => resolveListen(server));
  });
  const platformTarget = `http://127.0.0.1:${(platformApi.address() as AddressInfo).port}`;
  const target = platformOnly ? platformTarget : `http://127.0.0.1:${(api!.address() as AddressInfo).port}`;
  vite = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4391', '--strictPort'], {
    env: { ...process.env, OVERTRIP_E2E_API_TARGET: target, OVERTRIP_E2E_PLATFORM_TARGET: platformTarget, VITE_PLATFORM_MODE: platformOnly ? 'true' : 'false' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  vite.stdout!.on('data', chunk => { process.stdout.write(chunk); if (String(chunk).includes('ready in')) console.log('E2E_REAL_READY'); });
  vite.on('exit', async code => { if (!closing) { await cleanup(); process.exit(code || 0); } });
}

process.on('SIGTERM', () => { void cleanup().then(() => process.exit(0)); });
process.on('SIGINT', () => { void cleanup().then(() => process.exit(0)); });
main().catch(async error => { console.error(error); await cleanup(); process.exit(1); });
