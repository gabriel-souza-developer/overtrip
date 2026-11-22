import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { vi } from 'vitest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// Cobre a paridade de campos (preço, mídia, itinerário, embarques etc.) do
// cadastro/edição de viagens da empresa, adicionada à base essencial já
// testada em organization-trip-write-http.test.ts. Garante que mídia só
// aceita fotos próprias e publicadas, que embarques (TripDeparture) são
// substituídos por completo a cada edição sem afetar outra viagem/empresa,
// e que status permanece DRAFT mesmo com o restante dos campos preenchido.

let server: Server; let base: string; let directory: string;
let ownerId: string; let ownerToken: string;
let orgA: string; let orgB: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const jpeg = (color = '#112233') => sharp({ create: { width: 300, height: 200, channels: 3, background: color } }).jpeg().toBuffer();
const essentialBody = {
  title: 'Trilha do Pico', category: 'Trilha', description: 'Caminhada guiada com paradas para observação.',
  city: 'Areia', region: 'PB', startDateISO: '2030-07-01T09:00:00.000Z',
};

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'org-trip-media-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  const owner = await prisma.user.create({ data: { email: `org-trip-media-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  orgA = (await prisma.organization.create({ data: { name: 'Agência Mídia de Viagem A', slug: `org-trip-media-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Mídia de Viagem B', slug: `org-trip-media-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'OWNER' } });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.trip.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.mediaAsset.deleteMany({ where: { createdById: ownerId } });
  await prisma.membership.deleteMany({ where: { userId: ownerId } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

const upload = async (orgId: string, body: Buffer) =>
  (await fetch(`${base}/${orgId}/tourism/media`, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'image/jpeg' }, body })).json() as Promise<{ src: string; previewSrc: string }>;

describe('POST /api/organizations/:organizationId/tourism/trips — campos estendidos', () => {
  it('aceita preço, mídia própria, itinerário e embarques, mantendo status sempre DRAFT', async () => {
    const photo = await upload(orgA, await jpeg('#aabbcc'));
    const body = {
      ...essentialBody,
      priceValue: 199.9, priceDisplay: 'A partir de R$ 199,90', priceUnit: 'por pessoa', free: false,
      intensityClass: 'intenso', spotsLeft: 12,
      includes: ['Transporte', 'Guia credenciado'], includesHighlight: 'Tudo incluso',
      itinerary: ['06h00 - Saída', '09h00 - Chegada ao pico'],
      routeNotes: ['Leve protetor solar'], importantInfo: ['Idade mínima de 12 anos'],
      media: [{ src: photo.src, alt: 'Vista do pico', focus: 'center' }],
      meetingCity: 'Areia', meetingPoint: 'Praça central', meetingTBD: false,
      departures: [
        { time: '06h00', place: 'Shopping', city: 'Campina Grande' },
        { time: '06h30', place: 'Terminal', city: 'Areia', mapsUrl: 'https://maps.example/terminal' },
      ],
    };
    const response = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(body) });
    expect(response.status).toBe(201);
    const created = await response.json() as {
      id: string; status: string; priceValue: number; intensityClass: string; spotsLeft: number;
      includes: string[]; itinerary: string[]; media: Array<{ src: string; previewSrc: string; alt: string; focus?: string }>;
      departures: Array<{ time: string; place: string; orderIndex: number }>;
    };
    expect(created.status).toBe('DRAFT');
    expect(created.priceValue).toBe(199.9);
    expect(created.intensityClass).toBe('intenso');
    expect(created.spotsLeft).toBe(12);
    expect(created.includes).toEqual(['Transporte', 'Guia credenciado']);
    expect(created.itinerary).toEqual(['06h00 - Saída', '09h00 - Chegada ao pico']);
    expect(created.media).toHaveLength(1);
    // `src` fica canônico (o que assertOwnedImages exige ao reenviar); a
    // rota própria da empresa é só `previewSrc`.
    expect(created.media[0].src).toBe(photo.src);
    expect(created.media[0].previewSrc).toContain(`/organizations/${orgA}/tourism/media/`);
    expect(created.media[0].alt).toBe('Vista do pico');
    expect(created.media[0].focus).toBe('center');
    expect(created.departures.map((d) => d.place)).toEqual(['Shopping', 'Terminal']);
    expect(created.departures.map((d) => d.orderIndex)).toEqual([0, 1]);

    const row = await prisma.trip.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('DRAFT');
    expect(row.publishedAt).toBeNull();
  });

  it('recusa foto de outra empresa na criação, sem criar a viagem', async () => {
    const photoB = await upload(orgB, await jpeg('#ccbbaa'));
    const before = await prisma.trip.count({ where: { organizationId: orgA } });
    const response = await fetch(`${base}/${orgA}/tourism/trips`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ ...essentialBody, title: 'Viagem recusada', media: [{ src: photoB.src, alt: 'Foto de outra empresa' }] }),
    });
    expect(response.status).toBe(400);
    expect(await prisma.trip.count({ where: { organizationId: orgA } })).toBe(before);
  });

  it('viagem gratuita sem valor informado grava priceValue nulo', async () => {
    const response = await fetch(`${base}/${orgA}/tourism/trips`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ ...essentialBody, title: 'Viagem gratuita', free: true }),
    });
    expect(response.status).toBe(201);
    const created = await response.json() as { priceValue: number | null; free: boolean };
    expect(created.free).toBe(true);
    expect(created.priceValue).toBeNull();
  });
});

describe('PUT /api/organizations/:organizationId/tourism/trips/:tripId — campos estendidos', () => {
  async function createTrip() {
    const response = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(essentialBody) });
    return await response.json() as { id: string; updatedAt: string };
  }

  it('substitui embarques por completo e preserva os que não mudaram', async () => {
    const trip = await createTrip();
    const first = await fetch(`${base}/${orgA}/tourism/trips/${trip.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ departures: [{ time: '07h00', place: 'Praça', city: 'Areia' }], expectedUpdatedAt: trip.updatedAt }),
    });
    expect(first.status).toBe(200);
    const afterFirst = await first.json() as { updatedAt: string; departures: Array<{ place: string }> };
    expect(afterFirst.departures.map((d) => d.place)).toEqual(['Praça']);

    const second = await fetch(`${base}/${orgA}/tourism/trips/${trip.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ departures: [{ time: '06h00', place: 'Shopping', city: 'Campina Grande' }, { time: '06h30', place: 'Praça', city: 'Areia' }], expectedUpdatedAt: afterFirst.updatedAt }),
    });
    expect(second.status).toBe(200);
    const afterSecond = await second.json() as { departures: Array<{ place: string; orderIndex: number }> };
    expect(afterSecond.departures.map((d) => d.place)).toEqual(['Shopping', 'Praça']);
    expect(afterSecond.departures.map((d) => d.orderIndex)).toEqual([0, 1]);
    expect(await prisma.tripDeparture.count({ where: { tripId: trip.id } })).toBe(2);
  });

  it('não altera embarques de outra viagem ao editar a desta', async () => {
    const tripA = await createTrip();
    const otherResponse = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody, title: 'Outra viagem' }) });
    const tripOther = await otherResponse.json() as { id: string; updatedAt: string };
    await fetch(`${base}/${orgA}/tourism/trips/${tripOther.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ departures: [{ time: '05h00', place: 'Rodoviária', city: 'Areia' }], expectedUpdatedAt: tripOther.updatedAt }),
    });
    await fetch(`${base}/${orgA}/tourism/trips/${tripA.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ departures: [{ time: '06h00', place: 'Shopping', city: 'Areia' }], expectedUpdatedAt: tripA.updatedAt }),
    });
    expect(await prisma.tripDeparture.count({ where: { tripId: tripOther.id } })).toBe(1);
    const remaining = await prisma.tripDeparture.findFirstOrThrow({ where: { tripId: tripOther.id } });
    expect(remaining.place).toBe('Rodoviária');
  });

  it('recusa foto de outra empresa na edição; mídia própria é aceita', async () => {
    const trip = await createTrip();
    const photoB = await upload(orgB, await jpeg('#112233'));
    const denied = await fetch(`${base}/${orgA}/tourism/trips/${trip.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ media: [{ src: photoB.src, alt: 'Foto de outra empresa' }], expectedUpdatedAt: trip.updatedAt }),
    });
    expect(denied.status).toBe(400);

    const photoA = await upload(orgA, await jpeg('#332211'));
    const accepted = await fetch(`${base}/${orgA}/tourism/trips/${trip.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ media: [{ src: photoA.src, alt: 'Foto própria' }], expectedUpdatedAt: trip.updatedAt }),
    });
    expect(accepted.status).toBe(200);
    const updated = await accepted.json() as { media: Array<{ src: string; previewSrc: string; alt: string }> };
    expect(updated.media[0].src).toBe(photoA.src);
    expect(updated.media[0].previewSrc).toContain(`/organizations/${orgA}/tourism/media/`);
  });

  it('edita outro campo sem trocar a foto, reenviando o src devolvido pelo GET, sem falhar com 400', async () => {
    const photo = await upload(orgA, await jpeg('#445566'));
    const created = await (await fetch(`${base}/${orgA}/tourism/trips`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ ...essentialBody, title: 'Viagem com foto', media: [{ src: photo.src, alt: 'Foto da trilha' }] }),
    })).json() as { id: string; updatedAt: string; media: Array<{ src: string; alt: string }> };

    // O formulário de edição carrega pelo GET e reenvia exatamente o `src`
    // devolvido (nunca o previewSrc) ao salvar outro campo sem tocar a
    // foto — round-trip que a correção de assertOwnedImages precisa aceitar.
    const read = await (await fetch(`${base}/${orgA}/tourism/trips/${created.id}`, { headers: auth(ownerToken) })).json() as { media: Array<{ src: string; previewSrc: string; alt: string }>; updatedAt: string };
    const response = await fetch(`${base}/${orgA}/tourism/trips/${created.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ headlineDisplay: 'Destaque', media: read.media.map(({ src, alt }) => ({ src, alt })), expectedUpdatedAt: read.updatedAt }),
    });
    expect(response.status).toBe(200);
    const updated = await response.json() as { headlineDisplay: string | null; media: Array<{ src: string; alt: string }> };
    expect(updated.headlineDisplay).toBe('Destaque');
    expect(updated.media).toHaveLength(1);
    expect(updated.media[0].alt).toBe('Foto da trilha');
  });

  it('marcar como gratuita (sem enviar valor) preserva o valor guardado, igual à tela legada', async () => {
    // Igual à tela legada (TripForm.tsx): "free" só marca a exibição; o
    // valor já digitado continua guardado, para não se perder se a marcação
    // for desfeita depois. A tela da empresa decide se envia ou não
    // priceValue junto — aqui simulamos o toggle sem reenviar o valor.
    const createResponse = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify({ ...essentialBody, priceValue: 80 }) });
    const trip = await createResponse.json() as { id: string; updatedAt: string; priceValue: number };
    expect(trip.priceValue).toBe(80);

    const toFree = await fetch(`${base}/${orgA}/tourism/trips/${trip.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ free: true, expectedUpdatedAt: trip.updatedAt }) });
    const freeTrip = await toFree.json() as { priceValue: number | null; free: boolean; updatedAt: string };
    expect(freeTrip.free).toBe(true);
    expect(freeTrip.priceValue).toBe(80);

    const backToPaid = await fetch(`${base}/${orgA}/tourism/trips/${trip.id}`, { method: 'PUT', headers: auth(ownerToken), body: JSON.stringify({ free: false, expectedUpdatedAt: freeTrip.updatedAt }) });
    const paidAgain = await backToPaid.json() as { priceValue: number | null; free: boolean };
    expect(paidAgain.free).toBe(false);
    expect(paidAgain.priceValue).toBe(80);
  });

  it('nunca aceita status mesmo junto de campos estendidos válidos', async () => {
    const trip = await createTrip();
    const response = await fetch(`${base}/${orgA}/tourism/trips/${trip.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ status: 'OPEN', intensityClass: 'leve', expectedUpdatedAt: trip.updatedAt }),
    });
    expect(response.status).toBe(400);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe('DRAFT');
  });
});
