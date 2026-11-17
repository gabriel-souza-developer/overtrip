import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { config } from '../src/config.js';

// Visitas e memórias da galeria agora têm organizationId (nullable, migração
// aditiva): escopo legado (null + LEGACY_TOURISM_ORGANIZATION_ID) nas rotas
// administrativas, e PUBLIC_SITE_ORGANIZATION_IDS (só organizações ativas) no
// site público. Cobre: duas empresas, legado, vínculos cruzados pré-
// existentes, falhas de associação, destaque/reordenação não cruzando
// empresas, e o site público.

const prisma = new PrismaClient();
const TAG = `legacy-visit-gallery-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
let token: string;
let userId: string;
let orgAId: string;
let orgBId: string;
let orgCInactiveId: string;
let tripLegacyId: string;
let tripOrgAId: string;
let visitLegacyId: string;
let visitOrgAId: string;
let visitForeignTripId: string;
let galleryLegacyId: string;
let galleryForeignOnLegacyVisitId: string;

const authed = (extra: RequestInit = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, ...(extra.headers || {}) } });
const json = (method: string, body: unknown) => ({
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

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
    media: JSON.stringify([{ src: 'https://example.com/isolation.jpg', alt: 'Foto da viagem' }]),
    storedIdentity: `${TAG}:${label}`,
  },
});

const makeVisit = (organizationId: string | null, tripId: string | null, label: string) => prisma.visit.create({
  data: { organizationId, tripId, title: `${TAG}:${label}`, city: 'Cidade', region: 'PB', storedIdentity: `${TAG}:${label}` },
});

const makeGallery = (organizationId: string | null, tripId: string | null, visitId: string | null, label: string, opts: { isFeatured?: boolean; lat?: number } = {}) => prisma.galleryEntry.create({
  data: {
    organizationId, tripId, visitId,
    title: `${TAG}:${label}`,
    date: new Date('2026-12-01T06:00:00-03:00'),
    dateDisplay: '1 de dezembro de 2026',
    description: 'Descrição da memória de teste.',
    images: JSON.stringify([{ src: 'https://example.com/gallery.jpg', alt: 'Foto' }]),
    orderIndex: 0,
    storedIdentity: `${TAG}:${label}`,
    isFeatured: opts.isFeatured ?? false,
  },
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

  const [tripLegacy, tripOrgA] = await Promise.all([makeTrip(null, 'legacy'), makeTrip(orgAId, 'org-a')]);
  tripLegacyId = tripLegacy.id;
  tripOrgAId = tripOrgA.id;

  const [visitLegacy, visitOrgA, visitForeignTrip] = await Promise.all([
    makeVisit(null, tripLegacyId, 'visit-legacy'),
    makeVisit(orgAId, tripOrgAId, 'visit-org-a'),
    makeVisit(null, tripOrgAId, 'visit-foreign-trip'), // organizationId null, mas vinculada à viagem da empresa A
  ]);
  visitLegacyId = visitLegacy.id;
  visitOrgAId = visitOrgA.id;
  visitForeignTripId = visitForeignTrip.id;

  const [galleryLegacy, galleryForeignOnLegacyVisit] = await Promise.all([
    makeGallery(null, tripLegacyId, visitLegacyId, 'gallery-legacy'),
    makeGallery(orgBId, null, visitLegacyId, 'gallery-foreign-on-legacy-visit'), // empresa B vinculada à visita legada
  ]);
  galleryLegacyId = galleryLegacy.id;
  galleryForeignOnLegacyVisitId = galleryForeignOnLegacyVisit.id;
});

afterAll(async () => {
  config.legacyTourismOrganizationId = null;
  config.publicSiteOrganizationIds = [];
  await prisma.galleryEntry.deleteMany({ where: { title: { startsWith: `${TAG}:` } } });
  await prisma.visit.deleteMany({ where: { title: { startsWith: `${TAG}:` } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: `${TAG}:` } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId, orgCInactiveId] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('visitas: escopo legado e consistência de relação', () => {
  it('lista por tripId estrangeiro nunca retorna a visita legada vinculada a ele', async () => {
    const res = await (await fetch(`${baseUrl}/api/visits?tripId=${tripOrgAId}`, authed())).json() as { data: Array<{ id: string }> };
    expect(res.data.map((v) => v.id)).not.toContain(visitForeignTripId);
  });

  it('detalhe: 404 para visita com viagem estrangeira; 200 para visita legada coerente', async () => {
    expect((await fetch(`${baseUrl}/api/visits/${visitForeignTripId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/visits/${visitLegacyId}`, authed())).status).toBe(200);
  });

  it('detalhe de uma visita legada nunca inclui memória da galeria de outra empresa vinculada a ela', async () => {
    const res = await fetch(`${baseUrl}/api/visits/${visitLegacyId}`, authed());
    const body = await res.json() as { galleryEntries: Array<{ id: string }> };
    expect(body.galleryEntries.map((g) => g.id)).not.toContain(galleryForeignOnLegacyVisitId);
    expect(body.galleryEntries.map((g) => g.id)).toContain(galleryLegacyId);
  });

  it('PUT é negado em visita com viagem estrangeira e não a altera', async () => {
    const res = await fetch(`${baseUrl}/api/visits/${visitForeignTripId}`, json('PUT', { title: 'Sequestrada', city: 'Outra', region: 'PB' }));
    expect(res.status).toBe(404);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visitForeignTripId } })).title).toBe(`${TAG}:visit-foreign-trip`);
  });

  it('criação e associação recusam viagem de outra empresa (falha de associação)', async () => {
    const create = await fetch(`${baseUrl}/api/visits`, json('POST', { title: 'Nova', city: 'Cidade', region: 'PB', tripId: tripOrgAId }));
    expect(create.status).toBe(400);
    const associate = await fetch(`${baseUrl}/api/visits/${visitLegacyId}/associate`, json('POST', { tripId: tripOrgAId }));
    expect(associate.status).toBe(400);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visitLegacyId } })).tripId).toBe(tripLegacyId);
  });

  it('exclusão é bloqueada de forma genérica por memória da galeria de outra empresa vinculada (revisão: SetNull alteraria o vínculo estrangeiro)', async () => {
    // Uma revisão independente apontou que a decisão original aqui (permitir
    // a exclusão e deixar o FK SetNull desvincular a memória estrangeira) é
    // insegura: GalleryEntry.visitId tem onDelete SetNull, então a exclusão
    // alteraria silenciosamente um registro de outra empresa. Agora o delete
    // nem chega a ser tentado quando existe qualquer vínculo estrangeiro.
    const visit = await makeVisit(null, null, 'visit-to-delete-with-foreign-link');
    const foreignGallery = await makeGallery(orgBId, null, visit.id, 'gallery-blocking-foreign');
    const res = await fetch(`${baseUrl}/api/visits/${visit.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(await prisma.visit.findUnique({ where: { id: visit.id } })).not.toBeNull();
    expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: foreignGallery.id } })).visitId).toBe(visit.id);
    await prisma.galleryEntry.delete({ where: { id: foreignGallery.id } });
    await prisma.visit.delete({ where: { id: visit.id } });
  });

  it('exclusão é bloqueada por memória da galeria do próprio escopo vinculada', async () => {
    const visit = await makeVisit(null, null, 'visit-to-delete-with-own-link');
    const ownGallery = await makeGallery(null, null, visit.id, 'gallery-blocking-own');
    const res = await fetch(`${baseUrl}/api/visits/${visit.id}`, authed({ method: 'DELETE' }));
    expect(res.status).toBe(400);
    await prisma.galleryEntry.delete({ where: { id: ownGallery.id } });
    await prisma.visit.delete({ where: { id: visit.id } });
  });
});

describe('galeria: escopo legado, consistência de relação, destaque e reordenação', () => {
  it('lista e detalhe nunca retornam memória vinculada a visita de outra empresa', async () => {
    const list = await (await fetch(`${baseUrl}/api/gallery?visitId=${visitLegacyId}`, authed())).json() as { data: Array<{ id: string }> };
    expect(list.data.map((g) => g.id)).not.toContain(galleryForeignOnLegacyVisitId);
    expect((await fetch(`${baseUrl}/api/gallery/${galleryForeignOnLegacyVisitId}`, authed())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/gallery/${galleryLegacyId}`, authed())).status).toBe(200);
  });

  it('criação e atualização recusam viagem/visita de outra empresa (falha de associação)', async () => {
    const create = await fetch(`${baseUrl}/api/gallery`, json('POST', { title: 'Nova', date: new Date().toISOString(), dateDisplay: 'hoje', description: 'd', images: [{ src: 'https://example.com/a.jpg', alt: 'a' }], tripId: tripOrgAId }));
    expect(create.status).toBe(400);
    const update = await fetch(`${baseUrl}/api/gallery/${galleryLegacyId}`, json('PUT', { visitId: visitOrgAId }));
    expect(update.status).toBe(400);
  });

  it('destaque: marcar uma memória como destaque no próprio escopo não desmarca o destaque de outra empresa', async () => {
    const foreignFeatured = await makeGallery(orgBId, null, null, 'gallery-foreign-featured', { isFeatured: true });
    const res = await fetch(`${baseUrl}/api/gallery`, json('POST', { title: 'Destaque legado', date: new Date().toISOString(), dateDisplay: 'hoje', description: 'd', images: [{ src: 'https://example.com/b.jpg', alt: 'b' }], isFeatured: true }));
    expect(res.status).toBe(201);
    const created = await res.json() as { id: string };
    expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: foreignFeatured.id } })).isFeatured).toBe(true);
    await prisma.galleryEntry.deleteMany({ where: { id: { in: [foreignFeatured.id, created.id] } } });
  });

  it('reordenação: rejeita o lote inteiro se um item for de outra empresa, sem alterar os itens válidos', async () => {
    const own1 = await makeGallery(null, null, null, 'gallery-reorder-own-1');
    const own2 = await makeGallery(null, null, null, 'gallery-reorder-own-2');
    const foreign = await makeGallery(orgBId, null, null, 'gallery-reorder-foreign');

    const validReorder = await fetch(`${baseUrl}/api/gallery/reorder`, json('POST', { entries: [{ id: own1.id, orderIndex: 5 }, { id: own2.id, orderIndex: 6 }] }));
    expect(validReorder.status).toBe(200);
    expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: own1.id } })).orderIndex).toBe(5);

    const mixedReorder = await fetch(`${baseUrl}/api/gallery/reorder`, json('POST', { entries: [{ id: own1.id, orderIndex: 9 }, { id: foreign.id, orderIndex: 9 }] }));
    expect(mixedReorder.status).toBe(404);
    expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: own1.id } })).orderIndex).toBe(5);
    expect((await prisma.galleryEntry.findUniqueOrThrow({ where: { id: foreign.id } })).orderIndex).toBe(0);

    await prisma.galleryEntry.deleteMany({ where: { id: { in: [own1.id, own2.id, foreign.id] } } });
  });
});

describe('site público: galeria e destinos respeitam PUBLIC_SITE_ORGANIZATION_IDS e organizações ativas', () => {
  it('sem organização autorizada, só mostra conteúdo legado (organizationId null)', async () => {
    config.publicSiteOrganizationIds = [];
    const gallery = await (await fetch(`${baseUrl}/api/public/gallery`)).json() as Array<{ title: string }>;
    const titles = gallery.map((g) => g.title);
    expect(titles).toContain(`${TAG}:gallery-legacy`);
  });

  it('com a organização autorizada e ativa, passa a incluir o conteúdo dela; organização não autorizada ou inativa nunca aparece', async () => {
    const [galleryOrgA, galleryOrgB, galleryOrgCInactive] = await Promise.all([
      makeGallery(orgAId, null, null, 'gallery-public-org-a'),
      makeGallery(orgBId, null, null, 'gallery-public-org-b'),
      makeGallery(orgCInactiveId, null, null, 'gallery-public-org-c-inactive'),
    ]);
    const visitOrgAMap = await prisma.visit.create({ data: { organizationId: orgAId, title: `${TAG}:visit-public-org-a`, city: 'Cidade', region: 'PB', storedIdentity: `${TAG}:visit-public-org-a`, lat: -7.2, lng: -35.8, needsReview: false } });
    const visitOrgCMap = await prisma.visit.create({ data: { organizationId: orgCInactiveId, title: `${TAG}:visit-public-org-c-inactive`, city: 'Cidade', region: 'PB', storedIdentity: `${TAG}:visit-public-org-c-inactive`, lat: -7.2, lng: -35.8, needsReview: false } });
    try {
      config.publicSiteOrganizationIds = [orgAId, orgCInactiveId];
      const gallery = await (await fetch(`${baseUrl}/api/public/gallery`)).json() as Array<{ title: string }>;
      const titles = gallery.map((g) => g.title);
      expect(titles).toContain(`${TAG}:gallery-public-org-a`);
      expect(titles).not.toContain(`${TAG}:gallery-public-org-b`);
      expect(titles).not.toContain(`${TAG}:gallery-public-org-c-inactive`);

      const destinations = await (await fetch(`${baseUrl}/api/public/destinations`)).json() as Array<{ title: string }>;
      const destinationTitles = destinations.map((d) => d.title);
      expect(destinationTitles).toContain(`${TAG}:visit-public-org-a`);
      expect(destinationTitles).not.toContain(`${TAG}:visit-public-org-c-inactive`);
    } finally {
      config.publicSiteOrganizationIds = [];
      await prisma.galleryEntry.deleteMany({ where: { id: { in: [galleryOrgA.id, galleryOrgB.id, galleryOrgCInactive.id] } } });
      await prisma.visit.deleteMany({ where: { id: { in: [visitOrgAMap.id, visitOrgCMap.id] } } });
    }
  });
});

describe('com LEGACY_TOURISM_ORGANIZATION_ID configurado', () => {
  it('passa a incluir visitas/memórias da organização configurada, nunca de outra', async () => {
    config.legacyTourismOrganizationId = orgAId;
    try {
      // visitForeignTrip (organizationId null) referenciava a viagem da
      // empresa A: agora que A está no escopo, ambos estão no mesmo bucket.
      expect((await fetch(`${baseUrl}/api/visits/${visitForeignTripId}`, authed())).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/visits/${visitOrgAId}`, authed())).status).toBe(200);
      // galleryForeignOnLegacyVisit pertence à empresa B, nunca configurada: continua negada.
      expect((await fetch(`${baseUrl}/api/gallery/${galleryForeignOnLegacyVisitId}`, authed())).status).toBe(404);
    } finally {
      config.legacyTourismOrganizationId = null;
    }
  });
});
