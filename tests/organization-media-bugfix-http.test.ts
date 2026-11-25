import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';

// Cobre os bugs #1, #2 e #3 do brief de revisão independente (ver
// organizationOwnedMedia.ts, organizationGalleryRoutes.ts):
//
// #1 — presentVisits/presentGallery/presentTrips devolviam só a URL de
//      leitura própria da empresa em `src`, trocando o caminho canônico que
//      assertOwnedImages exige ao salvar; editar qualquer outro campo sem
//      tocar a foto, reenviando o `src` que o próprio GET acabou de devolver,
//      falhava com 400. A correção devolve as duas URLs: `src` (canônico) e
//      `previewSrc` (leitura própria da empresa).
// #2 — a miniatura da foto, antes de salvar ou ao reabrir o item, só
//      funciona com `previewSrc`: o caminho canônico só é servido em
//      /api/public/media quando a empresa está em
//      PUBLIC_SITE_ORGANIZATION_IDS — nunca o caso de uma empresa comum de
//      teste, cujo id nunca está nessa lista fixa.
// #3 — presentGallery lia só a primeira foto (parseStoredImages(..., 1))
//      mesmo a galeria aceitando até 5; salvar qualquer edição sem recarregar
//      a lista completa descartava as demais.

let server: Server; let base: string; let directory: string;
let ownerId: string; let ownerToken: string;
let orgA: string; let orgB: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const jpeg = (color = '#112233') => sharp({ create: { width: 300, height: 200, channels: 3, background: color } }).jpeg().toBuffer();

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'org-media-bugfix-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  const owner = await prisma.user.create({ data: { email: `org-media-bugfix-owner:${Date.now()}@example.test`, passwordHash: 'test', role: 'admin' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  orgA = (await prisma.organization.create({ data: { name: 'Agência Bugfix A', slug: `org-media-bugfix-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Bugfix B', slug: `org-media-bugfix-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { organizationId: orgA, userId: ownerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organizationId: orgB, userId: ownerId, role: 'OWNER' } });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.galleryEntry.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.visit.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.mediaAsset.deleteMany({ where: { createdById: ownerId } });
  await prisma.membership.deleteMany({ where: { userId: ownerId } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

const upload = async (orgId: string, color: string) =>
  (await fetch(`${base}/${orgId}/tourism/media`, { method: 'POST', headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'image/jpeg' }, body: await jpeg(color) })).json() as Promise<{ src: string; previewSrc: string }>;
// Sequencial, nunca Promise.all: envios concorrentes disputam a mesma
// escrita SQLite e passam do tempo limite do teste por contenção de lock.
const uploadSequence = async (orgId: string, colors: string[]) => {
  const photos: Array<{ src: string; previewSrc: string }> = [];
  for (const color of colors) photos.push(await upload(orgId, color));
  return photos;
};

describe('bug #1 — round-trip de leitura→edição→escrita sem trocar a foto', () => {
  it('destino visitado: edita a descrição reenviando o src devolvido pelo GET, sem falhar com 400', async () => {
    const photo = await upload(orgA, '#aa0011');
    const created = await (await fetch(`${base}/${orgA}/tourism/visits`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Praia do Bugfix', city: 'João Pessoa', region: 'PB', images: [{ src: photo.src, alt: 'Vista da praia' }] }),
    })).json() as { id: string; updatedAt: string };

    const read = await (await fetch(`${base}/${orgA}/tourism/visits/${created.id}`, { headers: auth(ownerToken) })).json() as { images: Array<{ src: string; previewSrc: string; alt: string }>; updatedAt: string };
    expect(read.images).toHaveLength(1);
    expect(read.images[0].src).toBe(photo.src); // canônico, nunca sobrescrito pela leitura

    const response = await fetch(`${base}/${orgA}/tourism/visits/${created.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ description: 'Descrição revisada', images: read.images.map(({ src, alt }) => ({ src, alt })), expectedUpdatedAt: read.updatedAt }),
    });
    expect(response.status).toBe(200);
    const updated = await response.json() as { description: string | null; images: Array<{ src: string; alt: string }> };
    expect(updated.description).toBe('Descrição revisada');
    expect(updated.images).toHaveLength(1);
    expect(updated.images[0].alt).toBe('Vista da praia');
  });

  it('galeria: edita o título reenviando o src devolvido pelo GET, sem falhar com 400', async () => {
    const photo = await upload(orgA, '#aa0022');
    const created = await (await fetch(`${base}/${orgA}/tourism/gallery`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Memória do Bugfix', date: '2030-02-01T12:00:00.000Z', dateDisplay: 'Fevereiro de 2030', description: 'Teste', images: [{ src: photo.src, alt: 'Grupo' }] }),
    })).json() as { id: string; updatedAt: string };

    const read = await (await fetch(`${base}/${orgA}/tourism/gallery/${created.id}`, { headers: auth(ownerToken) })).json() as { images: Array<{ src: string; previewSrc: string; alt: string }>; updatedAt: string };
    expect(read.images[0].src).toBe(photo.src);

    const response = await fetch(`${base}/${orgA}/tourism/gallery/${created.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Memória revisada', images: read.images.map(({ src, alt }) => ({ src, alt })), expectedUpdatedAt: read.updatedAt }),
    });
    expect(response.status).toBe(200);
    const updated = await response.json() as { title: string; images: Array<{ src: string; alt: string }> };
    expect(updated.title).toBe('Memória revisada');
    expect(updated.images).toHaveLength(1);
  });
});

describe('bug #3 — galeria preserva até 5 fotos', () => {
  it('cria com 5 fotos e preserva todas ao editar só o título', async () => {
    const photos = await uploadSequence(orgA, ['#100000', '#200000', '#300000', '#400000', '#500000']);
    const images = photos.map((photo, index) => ({ src: photo.src, alt: `Foto ${index + 1}` }));
    const created = await (await fetch(`${base}/${orgA}/tourism/gallery`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Álbum completo', date: '2030-03-01T12:00:00.000Z', dateDisplay: 'Março de 2030', description: 'Teste', images }),
    })).json() as { id: string; images: unknown[]; updatedAt: string };
    expect(created.images).toHaveLength(5);

    const read = await (await fetch(`${base}/${orgA}/tourism/gallery/${created.id}`, { headers: auth(ownerToken) })).json() as { images: Array<{ src: string; previewSrc: string; alt: string }>; updatedAt: string };
    expect(read.images).toHaveLength(5); // nunca truncado a 1 pela leitura (parseStoredImages limit)

    const response = await fetch(`${base}/${orgA}/tourism/gallery/${created.id}`, {
      method: 'PUT', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Álbum completo (revisado)', images: read.images.map(({ src, alt }) => ({ src, alt })), expectedUpdatedAt: read.updatedAt }),
    });
    expect(response.status).toBe(200);
    const updated = await response.json() as { title: string; images: Array<{ src: string; alt: string }> };
    expect(updated.title).toBe('Álbum completo (revisado)');
    expect(updated.images).toHaveLength(5); // as 5 fotos sobrevivem, não só a primeira
    expect(updated.images.map((i) => i.alt)).toEqual(['Foto 1', 'Foto 2', 'Foto 3', 'Foto 4', 'Foto 5']);
  });
});

describe('bug #2 — prévia autenticada por empresa funciona fora da vitrine pública', () => {
  it('previewSrc responde para a própria empresa mesmo com o caminho público recusando (organização nunca está em PUBLIC_SITE_ORGANIZATION_IDS neste teste)', async () => {
    const photo = await upload(orgA, '#665544');
    // PUBLIC_SITE_ORGANIZATION_IDS é uma lista fixa de produção; o id desta
    // organização de teste, gerado em tempo de execução, nunca está nela —
    // então o caminho canônico público nunca serve esta foto, com ou sem
    // qualquer bug: é exatamente a condição que a miniatura da própria
    // empresa precisa continuar funcionando (ver ImageUploader.tsx).
    const publicResponse = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${photo.src}`);
    expect(publicResponse.status).toBe(404);

    const previewResponse = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${photo.previewSrc}`, { headers: auth(ownerToken) });
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get('cache-control')).toContain('no-store');
  });

  it('a mesma prévia também responde pela rota própria de destinos e de galeria', async () => {
    const photo = await upload(orgA, '#223344');
    const visit = await (await fetch(`${base}/${orgA}/tourism/visits`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Destino com prévia', city: 'Recife', region: 'PE', images: [{ src: photo.src, alt: 'Foto' }] }),
    })).json() as { images: Array<{ previewSrc: string }> };
    const gallery = await (await fetch(`${base}/${orgA}/tourism/gallery`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Memória com prévia', date: '2030-04-01T12:00:00.000Z', dateDisplay: 'Abril de 2030', description: 'Teste', images: [{ src: photo.src, alt: 'Foto' }] }),
    })).json() as { images: Array<{ previewSrc: string }> };

    expect((await fetch(`${base}/${orgA}/tourism/visits/media/${visit.images[0].previewSrc.split('/').pop()}`, { headers: auth(ownerToken) })).status).toBe(200);
    expect((await fetch(`${base}/${orgA}/tourism/gallery/media/${gallery.images[0].previewSrc.split('/').pop()}`, { headers: auth(ownerToken) })).status).toBe(200);
  });
});

describe('isolamento entre duas empresas nas correções acima', () => {
  it('previewSrc, src canônico reenviado e a lista de 5 fotos nunca atravessam para outra empresa', async () => {
    const photoA = await upload(orgA, '#0a0a0a');
    const photoB = await upload(orgB, '#0b0b0b');

    // B nunca vê a prévia (nem mesmo o arquivo) de A, e vice-versa.
    const previewFileA = photoA.previewSrc.split('/').pop()!;
    expect((await fetch(`${base}/${orgB}/tourism/media/${previewFileA}`, { headers: auth(ownerToken) })).status).toBe(404);
    const previewFileB = photoB.previewSrc.split('/').pop()!;
    expect((await fetch(`${base}/${orgA}/tourism/media/${previewFileB}`, { headers: auth(ownerToken) })).status).toBe(404);

    // A nunca consegue criar um destino referenciando a foto canônica de B
    // mesmo reenviando exatamente o `src` que a correção do bug #1 devolve.
    const crossVisit = await fetch(`${base}/${orgA}/tourism/visits`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Tentativa cruzada', city: 'Cidade', region: 'PB', images: [{ src: photoB.src, alt: 'Foto de outra empresa' }] }),
    });
    expect(crossVisit.status).toBe(400);

    // Uma galeria de 5 fotos de A permanece com 5 fotos só para A; B não a
    // encontra nem edita por mais que tente usar o próprio id de B na rota.
    const photosA = await uploadSequence(orgA, ['#aa1111', '#aa2222', '#aa3333', '#aa4444', '#aa5555']);
    const galleryA = await (await fetch(`${base}/${orgA}/tourism/gallery`, {
      method: 'POST', headers: auth(ownerToken),
      body: JSON.stringify({ title: 'Álbum isolado', date: '2030-05-01T12:00:00.000Z', dateDisplay: 'Maio de 2030', description: 'Teste', images: photosA.map((p, i) => ({ src: p.src, alt: `Foto ${i + 1}` })) }),
    })).json() as { id: string };
    expect((await fetch(`${base}/${orgB}/tourism/gallery/${galleryA.id}`, { headers: auth(ownerToken) })).status).toBe(404);
  });
});
