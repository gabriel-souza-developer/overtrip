import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { backfillTourismOrganizations } from '../scripts/lib/tourismOrganizationBackfill';

const directory = mkdtempSync(join(tmpdir(), 'overtrip-tourism-backfill-'));
const databasePath = join(directory, 'test.db');
const databaseUrl = `file:${databasePath}`;
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const trip = (id: string, organizationId: string | null = null) => ({ id, organizationId, title: id, category: 'Teste', description: 'Teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]', storedIdentity: id });
const visit = (id: string, organizationId: string | null = null, tripId: string | null = null) => ({ id, organizationId, tripId, title: id, city: 'Cidade', region: 'PB', storedIdentity: id });
const galleryEntry = (id: string, organizationId: string | null = null, tripId: string | null = null, visitId: string | null = null) => ({ id, organizationId, tripId, visitId, title: id, date: new Date('2030-01-01T12:00:00Z'), dateDisplay: '1 de janeiro de 2030', description: 'Teste', images: '[]', orderIndex: 0, storedIdentity: id });
const mediaAsset = (id: string, organizationId: string | null = null) => ({ id, organizationId, storageKey: id, path: `/api/public/media/${id}.jpg`, mimeType: 'image/jpeg', width: 10, height: 10, sizeBytes: 100, originalBytes: 100, sha256: id.padEnd(64, '0'), createdById: 'user-a' });

beforeAll(() => {
  execFileSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
}, 30000);
beforeEach(async () => {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_backfill');
  await db.mediaAsset.deleteMany();
  await db.galleryEntry.deleteMany(); await db.visit.deleteMany();
  await db.reservation.deleteMany(); await db.lead.deleteMany(); await db.trip.deleteMany();
  await db.membership.deleteMany(); await db.organization.deleteMany(); await db.user.deleteMany();
  await db.organization.createMany({ data: [{ id: 'a', name: 'Agência A', slug: 'a' }, { id: 'b', name: 'Agência B', slug: 'b' }] });
  await db.user.create({ data: { id: 'user-a', email: 'fixture@example.test', passwordHash: 'fixture', role: 'admin' } });
});
afterAll(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe('atribuição preparatória de dados legados', () => {
  it('simula por padrão, aplica somente dados sem empresa e é idempotente', async () => {
    await db.trip.create({ data: trip('legacy') });
    await db.trip.create({ data: trip('other', 'b') });
    await db.lead.create({ data: { id: 'lead', name: 'Pessoa fictícia', tripId: 'legacy' } });
    await db.reservation.create({ data: { id: 'reservation', tripId: 'legacy', leadId: 'lead', customerName: 'Pessoa fictícia', totalCents: 500 } });
    const beforeTrip = await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } });
    const beforeLead = await db.lead.findUniqueOrThrow({ where: { id: 'lead' } });
    const beforeReservation = await db.reservation.findUniqueOrThrow({ where: { id: 'reservation' } });
    const simulation = await backfillTourismOrganizations(db, 'a', false);
    expect(simulation.mode).toBe('simulation');
    expect(simulation.before.trip).toEqual({ total: 2, unassigned: 1, target: 0, other: 1 });
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).organizationId).toBeNull();
    const applied = await backfillTourismOrganizations(db, 'a', true);
    expect(applied.mode).toBe('applied');
    expect(await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).toEqual({ ...beforeTrip, organizationId: 'a' });
    expect(await db.lead.findUniqueOrThrow({ where: { id: 'lead' } })).toEqual({ ...beforeLead, organizationId: 'a' });
    expect(await db.reservation.findUniqueOrThrow({ where: { id: 'reservation' } })).toEqual({ ...beforeReservation, organizationId: 'a' });
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'other' } })).organizationId).toBe('b');
    expect((await db.lead.findUniqueOrThrow({ where: { id: 'lead' } })).organizationId).toBe('a');
    expect((await db.reservation.findUniqueOrThrow({ where: { id: 'reservation' } })).organizationId).toBe('a');
    expect(await db.membership.count()).toBe(0);
    const repeated = await backfillTourismOrganizations(db, 'a', true);
    expect(repeated.before.trip.unassigned).toBe(0);
    expect(await db.user.count()).toBe(1);
  });

  it('recusa relações de empresas diferentes e mantém todos os dados sem atribuição', async () => {
    await db.trip.create({ data: trip('other', 'b') });
    await db.lead.create({ data: { id: 'legacy-lead', name: 'Fictício', tripId: 'other' } });
    await expect(backfillTourismOrganizations(db, 'a', false)).rejects.toThrow('Relacionamentos incompatíveis');
    await expect(backfillTourismOrganizations(db, 'a', true)).rejects.toThrow('Relacionamentos incompatíveis');
    expect((await db.lead.findUniqueOrThrow({ where: { id: 'legacy-lead' } })).organizationId).toBeNull();
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'other' } })).organizationId).toBe('b');
  });

  it('recusa empresa inativa tanto em simulação quanto em aplicação', async () => {
    await db.trip.create({ data: trip('legacy') });
    await db.organization.update({ where: { id: 'a' }, data: { status: 'INACTIVE' } });
    await expect(backfillTourismOrganizations(db, 'a', false)).rejects.toThrow('inativa');
    await expect(backfillTourismOrganizations(db, 'a', true)).rejects.toThrow('inativa');
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).organizationId).toBeNull();
  });

  it('recusa reserva ligada a interessado de outra empresa sem alterar a viagem', async () => {
    await db.trip.create({ data: trip('legacy') });
    await db.lead.create({ data: { id: 'other-lead', name: 'Fictício', organizationId: 'b' } });
    await db.reservation.create({ data: { id: 'reservation', tripId: 'legacy', leadId: 'other-lead', customerName: 'Fictício', totalCents: 100 } });
    await expect(backfillTourismOrganizations(db, 'a', true)).rejects.toThrow('reservas/interessados=1');
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).organizationId).toBeNull();
    expect((await db.reservation.findUniqueOrThrow({ where: { id: 'reservation' } })).organizationId).toBeNull();
    expect((await db.lead.findUniqueOrThrow({ where: { id: 'other-lead' } })).organizationId).toBe('b');
  });

  it('reverte atualizações anteriores se ocorrer erro durante a transação', async () => {
    await db.trip.create({ data: trip('legacy') });
    await db.lead.create({ data: { id: 'lead', name: 'Fictício', tripId: 'legacy' } });
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_backfill BEFORE UPDATE OF "organizationId" ON "Lead" WHEN OLD."organizationId" IS NULL BEGIN SELECT RAISE(ABORT, 'falha fictícia'); END`);
    await expect(backfillTourismOrganizations(db, 'a', true)).rejects.toThrow();
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).organizationId).toBeNull();
    expect((await db.lead.findUniqueOrThrow({ where: { id: 'lead' } })).organizationId).toBeNull();
  });

  it('recusa banco com referências inválidas antes de escrever', async () => {
    await db.trip.create({ data: trip('legacy') });
    execFileSync('python3', ['-c', `import sqlite3,sys
c=sqlite3.connect(sys.argv[1]); c.execute('PRAGMA foreign_keys=OFF')
c.execute("INSERT INTO Lead (id,name,tripId,updatedAt) VALUES ('orphan','Fictício','missing','2030-01-01')")
c.commit(); c.close()`, databasePath]);
    await expect(backfillTourismOrganizations(db, 'a', true)).rejects.toThrow('referência(s) inválida(s)');
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).organizationId).toBeNull();
    await db.$executeRaw`DELETE FROM "Lead" WHERE id = 'orphan'`;
  });

  it('CLI exige banco explícito existente e não grava sem --apply', async () => {
    await db.trip.create({ data: trip('legacy') });
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/backfill-tourism-organization.ts'), ...args], { env: { ...process.env, DATABASE_URL: 'file:/caminho-nao-utilizado.db' }, encoding: 'utf8' });
    const missing = join(directory, 'missing.db');
    expect(run('--database', `file:${missing}`, '--organization', 'a').status).not.toBe(0);
    expect(existsSync(missing)).toBe(false);
    const result = run('--database', databaseUrl, '--organization', 'a');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).mode).toBe('simulation');
    expect(result.stdout).not.toContain('fixture@example.test');
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).organizationId).toBeNull();
    const apply = run('--database', databaseUrl, '--organization', 'a', '--apply');
    expect(apply.status, apply.stderr).toBe(0);
    expect(JSON.parse(apply.stdout).mode).toBe('applied');
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).organizationId).toBe('a');
  });

  it('CLI não divulga mensagem bruta de erro do banco e reverte a operação', async () => {
    await db.trip.create({ data: trip('legacy') });
    await db.lead.create({ data: { id: 'lead', name: 'Fictício', tripId: 'legacy' } });
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_backfill BEFORE UPDATE OF "organizationId" ON "Lead" WHEN OLD."organizationId" IS NULL BEGIN SELECT RAISE(ABORT, 'private-fixture-database-message'); END`);
    const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/backfill-tourism-organization.ts'), '--database', databaseUrl, '--organization', 'a', '--apply'], { encoding: 'utf8', env: process.env });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Nenhuma alteração foi aplicada');
    expect(result.stderr + result.stdout).not.toContain('private-fixture-database-message');
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'legacy' } })).organizationId).toBeNull();
    expect((await db.lead.findUniqueOrThrow({ where: { id: 'lead' } })).organizationId).toBeNull();
  });

  it('também atribui visitas e memórias da galeria sem empresa, preservando vínculos legados', async () => {
    await db.trip.create({ data: trip('legacy') });
    await db.visit.create({ data: visit('visit-legacy', null, 'legacy') });
    await db.galleryEntry.create({ data: galleryEntry('gallery-legacy', null, 'legacy', 'visit-legacy') });
    await db.visit.create({ data: visit('visit-no-trip', null, null) });
    const simulation = await backfillTourismOrganizations(db, 'a', false);
    expect(simulation.before.visit).toEqual({ total: 2, unassigned: 2, target: 0, other: 0 });
    expect(simulation.before.galleryEntry).toEqual({ total: 1, unassigned: 1, target: 0, other: 0 });
    expect((await db.visit.findUniqueOrThrow({ where: { id: 'visit-legacy' } })).organizationId).toBeNull();
    const applied = await backfillTourismOrganizations(db, 'a', true);
    expect(applied.mode).toBe('applied');
    expect((await db.visit.findUniqueOrThrow({ where: { id: 'visit-legacy' } })).organizationId).toBe('a');
    expect((await db.visit.findUniqueOrThrow({ where: { id: 'visit-no-trip' } })).organizationId).toBe('a');
    expect((await db.galleryEntry.findUniqueOrThrow({ where: { id: 'gallery-legacy' } })).organizationId).toBe('a');
    const repeated = await backfillTourismOrganizations(db, 'a', true);
    expect(repeated.before.visit.unassigned).toBe(0);
    expect(repeated.before.galleryEntry.unassigned).toBe(0);
  });

  it('recusa visita vinculada a viagem de outra empresa sem alterar nenhum dado', async () => {
    await db.trip.create({ data: trip('other', 'b') });
    await db.visit.create({ data: visit('visit-cross', null, 'other') });
    await expect(backfillTourismOrganizations(db, 'a', false)).rejects.toThrow('visitas/viagens=1');
    await expect(backfillTourismOrganizations(db, 'a', true)).rejects.toThrow('visitas/viagens=1');
    expect((await db.visit.findUniqueOrThrow({ where: { id: 'visit-cross' } })).organizationId).toBeNull();
    expect((await db.trip.findUniqueOrThrow({ where: { id: 'other' } })).organizationId).toBe('b');
  });

  it('recusa memória da galeria vinculada a visita de outra empresa sem alterar nenhum dado', async () => {
    await db.visit.create({ data: { ...visit('visit-other', null, null), organizationId: 'b' } });
    await db.galleryEntry.create({ data: galleryEntry('gallery-cross', null, null, 'visit-other') });
    await expect(backfillTourismOrganizations(db, 'a', false)).rejects.toThrow('galeria/visitas=1');
    await expect(backfillTourismOrganizations(db, 'a', true)).rejects.toThrow('galeria/visitas=1');
    expect((await db.galleryEntry.findUniqueOrThrow({ where: { id: 'gallery-cross' } })).organizationId).toBeNull();
    expect((await db.visit.findUniqueOrThrow({ where: { id: 'visit-other' } })).organizationId).toBe('b');
  });

  it('também atribui mídia sem empresa, sem alterar mídia de outra empresa', async () => {
    await db.mediaAsset.create({ data: mediaAsset('media-legacy') });
    await db.mediaAsset.create({ data: { ...mediaAsset('media-other'), organizationId: 'b' } });
    const simulation = await backfillTourismOrganizations(db, 'a', false);
    expect(simulation.before.mediaAsset).toEqual({ total: 2, unassigned: 1, target: 0, other: 1 });
    const applied = await backfillTourismOrganizations(db, 'a', true);
    expect(applied.mode).toBe('applied');
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: 'media-legacy' } })).organizationId).toBe('a');
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: 'media-other' } })).organizationId).toBe('b');
    const repeated = await backfillTourismOrganizations(db, 'a', true);
    expect(repeated.before.mediaAsset.unassigned).toBe(0);
  });
});
