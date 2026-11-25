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

// "Usar como modelo" (OrganizationTrips.tsx) não tem rota própria: a tela lê
// a viagem de origem pelo GET já isolado por empresa, limpa data/horário/
// vagas/embarques no cliente (prepareOrgTripTemplate) e cria um rascunho
// NOVO pelo mesmo POST já testado em organization-trip-write-http.test.ts e
// organization-trip-media-http.test.ts. Este arquivo cobre o caminho
// específico do recurso: a viagem de origem pode estar em qualquer situação
// (inclusive já publicada/concluída), o rascunho novo nunca carrega
// identificador, reserva, vaga ou embarque antigo, a viagem original nunca é
// alterada, e papel/titularidade são revalidados como em qualquer escrita.

let server: Server; let base: string; let directory: string;
let ownerId: string; let ownerToken: string;
let adminId: string; let adminToken: string;
let memberId: string; let memberToken: string;
let orgA: string; let orgB: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const jpeg = (color = '#112233') => sharp({ create: { width: 300, height: 200, channels: 3, background: color } }).jpeg().toBuffer();

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'org-trip-template-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  const owner = await prisma.user.create({ data: { email: `org-trip-template-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const admin = await prisma.user.create({ data: { email: `org-trip-template-admin:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  adminId = admin.id; adminToken = generateToken(admin);
  const member = await prisma.user.create({ data: { email: `org-trip-template-member:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  memberId = member.id; memberToken = generateToken(member);

  orgA = (await prisma.organization.create({ data: { name: 'Agência Modelo A', slug: `org-trip-template-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Modelo B', slug: `org-trip-template-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: adminId, role: 'ADMIN' } });
  await prisma.membership.create({ data: { organizationId: orgA, userId: memberId, role: 'MEMBER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'OWNER' } });

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.trip.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.mediaAsset.deleteMany({ where: { createdById: ownerId } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, adminId, memberId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId, memberId] } } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

const upload = async (orgId: string, body: Buffer) =>
  (await fetch(`${base}/${orgId}/tourism/media`, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'image/jpeg' }, body })).json() as Promise<{ src: string; previewSrc: string }>;

type TripDetail = {
  id: string; title: string; category: string; description: string; city: string; region: string; status: string;
  startDateISO: string; endDateISO: string | null; spotsLeft: number | null;
  includes: string[]; media: Array<{ src: string; alt: string }>;
  departures: Array<{ time: string; place: string; city: string }>;
};

/** Monta o rascunho novo exatamente como prepareOrgTripTemplate + save() fariam a partir de um GET. */
function templatePayloadFrom(source: TripDetail, startDateISO: string) {
  return {
    title: source.title, category: source.category, description: source.description, city: source.city, region: source.region,
    startDateISO, endDateISO: null,
    includes: source.includes, media: source.media.map(({ src, alt }) => ({ src, alt })),
    // Limpos pelo prepareOrgTripTemplate: nenhuma vaga/embarque da execução anterior.
    spotsLeft: null, departures: [],
  };
}

async function createSourceTrip() {
  const photo = await upload(orgA, await jpeg('#aabbcc'));
  const response = await fetch(`${base}/${orgA}/tourism/trips`, {
    method: 'POST', headers: auth(ownerToken),
    body: JSON.stringify({
      title: 'Trilha do Pico (já rodada)', category: 'Trilha', description: 'Caminhada guiada com paradas para observação.',
      city: 'Areia', region: 'PB', startDateISO: '2024-07-01T09:00:00.000Z', endDateISO: '2024-07-01T18:00:00.000Z',
      spotsLeft: 3, includes: ['Transporte', 'Guia credenciado'],
      media: [{ src: photo.src, alt: 'Vista do pico' }],
      departures: [{ time: '06h00', place: 'Shopping', city: 'Campina Grande' }],
    }),
  });
  expect(response.status).toBe(201);
  const created = await response.json() as { id: string };
  // A viagem de origem do recurso normalmente já rodou (publicada/concluída);
  // o GET de leitura não filtra por status, então isto também prova que
  // "usar como modelo" funciona a partir de qualquer situação.
  await prisma.trip.update({ where: { id: created.id }, data: { status: 'COMPLETED', publishedAt: new Date() } });
  return created.id;
}

describe('usar viagem como modelo — isolamento e papéis', () => {
  it('OWNER lê a viagem própria (qualquer situação) e cria um rascunho novo, sem afetar a original', async () => {
    const sourceId = await createSourceTrip();

    const read = await fetch(`${base}/${orgA}/tourism/trips/${sourceId}`, { headers: auth(ownerToken) });
    expect(read.status).toBe(200);
    const source = await read.json() as TripDetail;
    expect(source.status).toBe('COMPLETED');

    const payload = templatePayloadFrom(source, '2031-03-01T09:00:00.000Z');
    const response = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(payload) });
    expect(response.status).toBe(201);
    const created = await response.json() as TripDetail & { storedIdentity?: string };

    // Rascunho novo e independente: id diferente, sempre DRAFT (mesmo a
    // origem estando COMPLETED), sem vagas/embarques antigos, sem
    // storedIdentity exposto, conteúdo reaproveitável preservado.
    expect(created.id).not.toBe(sourceId);
    expect(created.status).toBe('DRAFT');
    expect(created.spotsLeft).toBeNull();
    expect(created.departures).toEqual([]);
    expect(created.title).toBe(source.title);
    expect(created.includes).toEqual(source.includes);
    expect(created.media).toHaveLength(1);
    expect(JSON.stringify(created)).not.toContain('storedIdentity');

    // A viagem original permanece intacta no banco.
    const original = await prisma.trip.findUniqueOrThrow({ where: { id: sourceId } });
    expect(original.status).toBe('COMPLETED');
    expect(original.spotsLeft).toBe(3);
    expect(await prisma.tripDeparture.count({ where: { tripId: sourceId } })).toBe(1);
  });

  it('ADMIN também pode ler e criar a partir do modelo', async () => {
    const sourceId = await createSourceTrip();
    const source = await (await fetch(`${base}/${orgA}/tourism/trips/${sourceId}`, { headers: auth(adminToken) })).json() as TripDetail;
    const response = await fetch(`${base}/${orgA}/tourism/trips`, {
      method: 'POST', headers: auth(adminToken), body: JSON.stringify(templatePayloadFrom(source, '2031-04-01T09:00:00.000Z')),
    });
    expect(response.status).toBe(201);
    expect((await response.json() as { status: string }).status).toBe('DRAFT');
  });

  it('MEMBER lê a viagem (para ver o modelo) mas não pode criar o rascunho a partir dele', async () => {
    const sourceId = await createSourceTrip();
    const read = await fetch(`${base}/${orgA}/tourism/trips/${sourceId}`, { headers: auth(memberToken) });
    expect(read.status).toBe(200);
    const source = await read.json() as TripDetail;

    const before = await prisma.trip.count({ where: { organizationId: orgA } });
    const response = await fetch(`${base}/${orgA}/tourism/trips`, {
      method: 'POST', headers: auth(memberToken), body: JSON.stringify(templatePayloadFrom(source, '2031-05-01T09:00:00.000Z')),
    });
    expect(response.status).toBe(403);
    const body = await response.json() as { code: string };
    expect(body.code).toBe('ORGANIZATION_ROLE_DENIED');
    expect(await prisma.trip.count({ where: { organizationId: orgA } })).toBe(before);
  });

  it('nunca lê (nem usa como modelo) viagem de outra empresa: id correto na organização errada responde 404', async () => {
    const sourceId = await createSourceTrip();
    const response = await fetch(`${base}/${orgB}/tourism/trips/${sourceId}`, { headers: auth(ownerToken) });
    expect(response.status).toBe(404);
  });

  it('recusa mídia de outra empresa dentro do rascunho criado a partir do modelo, sem criar a viagem', async () => {
    const sourceId = await createSourceTrip();
    const source = await (await fetch(`${base}/${orgA}/tourism/trips/${sourceId}`, { headers: auth(ownerToken) })).json() as TripDetail;
    const foreignPhoto = await upload(orgB, await jpeg('#ffeedd'));

    const payload = { ...templatePayloadFrom(source, '2031-06-01T09:00:00.000Z'), media: [{ src: foreignPhoto.src, alt: 'Foto de outra empresa' }] };
    const before = await prisma.trip.count({ where: { organizationId: orgA } });
    const response = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(payload) });
    expect(response.status).toBe(400);
    expect(await prisma.trip.count({ where: { organizationId: orgA } })).toBe(before);
  });

  it('recusa um src de mídia inválido (fora do padrão canônico) dentro do rascunho criado a partir do modelo', async () => {
    const sourceId = await createSourceTrip();
    const source = await (await fetch(`${base}/${orgA}/tourism/trips/${sourceId}`, { headers: auth(ownerToken) })).json() as TripDetail;

    const payload = { ...templatePayloadFrom(source, '2031-07-01T09:00:00.000Z'), media: [{ src: '/assets/images/geral/foto-legado.jpg', alt: 'Foto do acervo legado' }] };
    const before = await prisma.trip.count({ where: { organizationId: orgA } });
    const response = await fetch(`${base}/${orgA}/tourism/trips`, { method: 'POST', headers: auth(ownerToken), body: JSON.stringify(payload) });
    expect(response.status).toBe(400);
    expect(await prisma.trip.count({ where: { organizationId: orgA } })).toBe(before);
  });
});
