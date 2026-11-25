import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

// Revisão independente achou vazamentos em dados já cruzados que a entrega
// anterior não cobria: tripService.findAll/findById expunham visitas/galeria
// de outra empresa vinculadas a uma viagem do próprio escopo (_count global e
// include sem filtro de organização); tripService.delete e visitService.delete
// contavam só o próprio escopo e seguiam para o delete mesmo quando um vínculo
// estrangeiro existia, deixando o FK (onDelete SetNull em Visit.tripId,
// GalleryEntry.tripId/visitId) alterar silenciosamente um registro de
// terceiros. publicSite.ts também filtrava só a organização do próprio
// registro, não a da viagem/visita vinculada (vínculo cruzado com empresa
// estrangeira ou inativa). Este arquivo cobre as correções.

const prisma = new PrismaClient();
const TAG = `trip-visit-cross-link-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let orgAId: string;
let orgBId: string;
let orgCInactiveId: string;

const authed = (extra: RequestInit = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) } });

const makeTrip = (organizationId: string | null, label: string) => prisma.trip.create({
  data: {
    organizationId,
    title: `${TAG}:${label}`,
    category: 'Teste',
    description: 'Descrição completa da experiência de teste.',
    city: 'Cidade',
    region: 'PB',
    startDateISO: new Date('2026-12-01T06:00:00-03:00'),
    intensityClass: 'moderado',
    includes: JSON.stringify([]),
    priceValue: 100,
    meetingTBD: true,
    media: JSON.stringify([{ src: 'https://example.com/cross-link.jpg', alt: 'Foto' }]),
    storedIdentity: `${TAG}:${label}`,
  },
});

const makeVisit = (organizationId: string | null, tripId: string | null, label: string, opts: { needsReview?: boolean; lat?: number; lng?: number } = {}) => prisma.visit.create({
  data: { organizationId, tripId, title: `${TAG}:${label}`, city: 'Cidade', region: 'PB', storedIdentity: `${TAG}:${label}`, needsReview: opts.needsReview ?? false, lat: opts.lat ?? null, lng: opts.lng ?? null },
});

const makeGallery = (organizationId: string | null, tripId: string | null, visitId: string | null, label: string, opts: { isFeatured?: boolean } = {}) => prisma.galleryEntry.create({
  data: {
    organizationId, tripId, visitId,
    title: `${TAG}:${label}`,
    date: new Date('2026-12-01T06:00:00-03:00'),
    dateDisplay: '1 de dezembro de 2026',
    description: 'Descrição da memória de teste.',
    images: JSON.stringify([{ src: 'https://example.com/gallery-cross-link.jpg', alt: 'Foto' }]),
    orderIndex: 0,
    storedIdentity: `${TAG}:${label}`,
    isFeatured: opts.isFeatured ?? false,
  },
});

const makeLead = (organizationId: string | null, tripId: string | null, label: string) => prisma.lead.create({
  data: { organizationId, tripId, name: `${TAG}:${label}` },
});

const makeReservation = (organizationId: string | null, tripId: string, label: string) => prisma.reservation.create({
  data: { organizationId, tripId, customerName: `${TAG}:${label}`, totalCents: 10000 },
});

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const user = await prisma.user.create({
    data: { legacyAccess: true, email: `test:${TAG}@example.com`, passwordHash: 'unused-in-this-test', role: 'admin' },
  });
  userId = user.id;
  token = generateToken(user);

  const [orgA, orgB, orgCInactive] = await Promise.all([
    prisma.organization.create({ data: { name: `${TAG}:A`, slug: `${TAG}-a` } }),
    prisma.organization.create({ data: { name: `${TAG}:B`, slug: `${TAG}-b` } }),
    prisma.organization.create({ data: { name: `${TAG}:C`, slug: `${TAG}-c`, status: 'INACTIVE' } }),
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;
  orgCInactiveId = orgCInactive.id;
});

afterAll(async () => {
  config.legacyTourismOrganizationId = null;
  config.publicSiteOrganizationIds = [];
  await prisma.reservation.deleteMany({ where: { customerName: { startsWith: `${TAG}:` } } });
  await prisma.lead.deleteMany({ where: { name: { startsWith: `${TAG}:` } } });
  await prisma.galleryEntry.deleteMany({ where: { title: { startsWith: `${TAG}:` } } });
  await prisma.visit.deleteMany({ where: { title: { startsWith: `${TAG}:` } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId, orgCInactiveId] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('viagem: contagens e includes não vazam vínculo de outra empresa', () => {
  it('GET /api/trips: _count.visits/_count.galleryEntries ignora vínculo estrangeiro', async () => {
    const trip = await makeTrip(null, 'trip-count-leak');
    const foreignVisit = await makeVisit(orgBId, trip.id, 'visit-count-leak');
    const foreignGallery = await makeGallery(orgBId, trip.id, null, 'gallery-count-leak', { isFeatured: true });

    const res = await (await fetch(`${baseUrl}/api/trips?limit=100`, authed())).json() as { data: Array<{ id: string; _count: { visits: number; galleryEntries: number } }> };
    const found = res.data.find((t) => t.id === trip.id);
    expect(found).toBeDefined();
    expect(found!._count.visits).toBe(0);
    expect(found!._count.galleryEntries).toBe(0);

    await prisma.galleryEntry.delete({ where: { id: foreignGallery.id } });
    await prisma.visit.delete({ where: { id: foreignVisit.id } });
    await prisma.trip.delete({ where: { id: trip.id } });
  });

  it('GET /api/trips/:id: visits/galleryEntries do include nunca trazem registro de outra empresa', async () => {
    const trip = await makeTrip(null, 'trip-include-leak');
    const foreignVisit = await makeVisit(orgBId, trip.id, 'visit-include-leak', { needsReview: false });
    const foreignGallery = await makeGallery(orgBId, trip.id, null, 'gallery-include-leak', { isFeatured: true });
    const ownVisit = await makeVisit(null, trip.id, 'visit-own-visible', { needsReview: false });
    const ownGallery = await makeGallery(null, trip.id, null, 'gallery-own-visible', { isFeatured: true });

    const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, authed());
    const body = await res.json() as { visits: Array<{ id: string }>; galleryEntries: Array<{ id: string }> };
    expect(body.visits.map((v) => v.id)).not.toContain(foreignVisit.id);
    expect(body.galleryEntries.map((g) => g.id)).not.toContain(foreignGallery.id);
    expect(body.visits.map((v) => v.id)).toContain(ownVisit.id);
    expect(body.galleryEntries.map((g) => g.id)).toContain(ownGallery.id);

    await prisma.galleryEntry.deleteMany({ where: { id: { in: [foreignGallery.id, ownGallery.id] } } });
    await prisma.visit.deleteMany({ where: { id: { in: [foreignVisit.id, ownVisit.id] } } });
    await prisma.trip.delete({ where: { id: trip.id } });
  });
});

describe('exclusão: vínculo de outra empresa bloqueia de forma genérica, sem revelar dado nem alterar o registro estrangeiro', () => {
  it('DELETE /api/trips/:id: bloqueado por lead estrangeiro, sem contagem no erro, viagem e lead intactos', async () => {
    const trip = await makeTrip(null, 'trip-delete-foreign-lead');
    const foreignLead = await makeLead(orgBId, trip.id, 'lead-blocking-foreign');

    const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(409);
    const body = await res.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toMatch(/\d/); // nenhuma contagem numérica no corpo do erro

    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).not.toBeNull();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: foreignLead.id } })).tripId).toBe(trip.id);

    await prisma.lead.delete({ where: { id: foreignLead.id } });
    await prisma.trip.delete({ where: { id: trip.id } });
  });

  it('DELETE /api/trips/:id: bloqueado por reserva estrangeira, viagem e reserva intactas', async () => {
    const trip = await makeTrip(null, 'trip-delete-foreign-reservation');
    const foreignReservation = await makeReservation(orgBId, trip.id, 'reservation-blocking-foreign');

    const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).not.toBeNull();
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: foreignReservation.id } })).tripId).toBe(trip.id);

    await prisma.reservation.delete({ where: { id: foreignReservation.id } });
    await prisma.trip.delete({ where: { id: trip.id } });
  });

  it('DELETE /api/trips/:id: bloqueado por visita estrangeira (Visit.tripId é onDelete SetNull) sem alterar o vínculo dela', async () => {
    const trip = await makeTrip(null, 'trip-delete-foreign-visit');
    const foreignVisit = await makeVisit(orgBId, trip.id, 'visit-blocking-foreign');

    const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).not.toBeNull();
    // Se o delete tivesse sido tentado, o FK (onDelete SetNull) teria zerado isto.
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: foreignVisit.id } })).tripId).toBe(trip.id);

    await prisma.visit.delete({ where: { id: foreignVisit.id } });
    await prisma.trip.delete({ where: { id: trip.id } });
  });

  it('DELETE /api/trips/:id: bloqueado por memória da galeria estrangeira (GalleryEntry.tripId é onDelete SetNull) sem alterar o vínculo dela', async () => {
    const trip = await makeTrip(null, 'trip-delete-foreign-gallery');
    const foreignGallery = await makeGallery(orgBId, trip.id, null, 'gallery-blocking-foreign-trip');

    const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).not.toBeNull();
    expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: foreignGallery.id } })).tripId).toBe(trip.id);

    await prisma.galleryEntry.delete({ where: { id: foreignGallery.id } });
    await prisma.trip.delete({ where: { id: trip.id } });
  });

  it('DELETE /api/trips/:id: continua funcionando quando só há vínculos do próprio escopo (sem regressão)', async () => {
    const trip = await makeTrip(null, 'trip-delete-clean');
    const res = await fetch(`${baseUrl}/api/trips/${trip.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(await prisma.trip.findUnique({ where: { id: trip.id } })).toBeNull();
  });

  it('DELETE /api/visits/:id: bloqueado por memória da galeria estrangeira (GalleryEntry.visitId é onDelete SetNull) sem alterar o vínculo dela', async () => {
    const visit = await makeVisit(null, null, 'visit-delete-foreign-gallery');
    const foreignGallery = await makeGallery(orgBId, null, visit.id, 'gallery-blocking-foreign-visit');

    const res = await fetch(`${baseUrl}/api/visits/${visit.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(await prisma.visit.findUnique({ where: { id: visit.id } })).not.toBeNull();
    expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: foreignGallery.id } })).visitId).toBe(visit.id);

    await prisma.galleryEntry.delete({ where: { id: foreignGallery.id } });
    await prisma.visit.delete({ where: { id: visit.id } });
  });

  it('DELETE /api/visits/:id: continua funcionando quando só há vínculo do próprio escopo (sem regressão)', async () => {
    const visit = await makeVisit(null, null, 'visit-delete-clean');
    const res = await fetch(`${baseUrl}/api/visits/${visit.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(await prisma.visit.findUnique({ where: { id: visit.id } })).toBeNull();
  });
});

describe('site público: relações transitivas (visit.trip, gallery.trip/visit) respeitam organização estrangeira/inativa', () => {
  it('memória pública (organizationId null) vinculada a viagem de empresa não autorizada nunca aparece; passa a aparecer quando a empresa é autorizada e ativa', async () => {
    config.publicSiteOrganizationIds = [];
    const foreignTrip = await makeTrip(orgAId, 'public-cross-trip');
    const crossGallery = await makeGallery(null, foreignTrip.id, null, 'public-cross-gallery');
    try {
      const before = await (await fetch(`${baseUrl}/api/public/gallery`)).json() as Array<{ title: string }>;
      expect(before.map((g) => g.title)).not.toContain(`${TAG}:public-cross-gallery`);

      config.publicSiteOrganizationIds = [orgAId];
      const after = await (await fetch(`${baseUrl}/api/public/gallery`)).json() as Array<{ title: string }>;
      expect(after.map((g) => g.title)).toContain(`${TAG}:public-cross-gallery`);
    } finally {
      config.publicSiteOrganizationIds = [];
      await prisma.galleryEntry.delete({ where: { id: crossGallery.id } });
      await prisma.trip.delete({ where: { id: foreignTrip.id } });
    }
  });

  it('destino público (organizationId null) vinculado a viagem de empresa autorizada porém inativa nunca aparece', async () => {
    const inactiveTrip = await makeTrip(orgCInactiveId, 'public-cross-trip-inactive');
    const crossVisit = await makeVisit(null, inactiveTrip.id, 'public-cross-visit-inactive', { lat: -7.2, lng: -35.8 });
    try {
      config.publicSiteOrganizationIds = [orgCInactiveId];
      const destinations = await (await fetch(`${baseUrl}/api/public/destinations`)).json() as Array<{ title: string }>;
      expect(destinations.map((d) => d.title)).not.toContain(`${TAG}:public-cross-visit-inactive`);
    } finally {
      config.publicSiteOrganizationIds = [];
      await prisma.visit.delete({ where: { id: crossVisit.id } });
      await prisma.trip.delete({ where: { id: inactiveTrip.id } });
    }
  });
});
