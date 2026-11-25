import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { storeScannedPdf } from '../src/services/documentStorage.js';

// Simula só a varredura antivírus (clamd está indisponível neste host,
// mesma situação documentada em scripts/e2e-organization-trip-documents-real.mjs)
// — nunca a sandbox de extração de fotos (bwrap/prlimit/pdfimages), que
// continua chamando os binários reais do host. Delega qualquer outra
// chamada ao execFile real.
const SCANNER_PATH = '/tmp/org-trip-doc-images-fake-scanner';
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: (file: string, args: unknown, options: unknown, callback: Function) => {
    if (file === SCANNER_PATH) return callback(null, '');
    return actual.execFile(file, args as string[], options as object, callback as never);
  } };
});

// Hooks run after the real sandbox, before publication, to test revocation races.
const processHook = vi.hoisted(() => ({ onProcessed: null as null | (() => Promise<void>) }));

// onExtracted, quando definido, roda DEPOIS da extração real (sandbox
// bwrap/prlimit/pdfimages de verdade, nunca simulada) e ANTES de qualquer
// revalidação feita pela rota depois dela — usado só para provar que
// revogar o vínculo ou excluir/expirar o documento DURANTE a extração
// ainda é pego pela checagem de depois, tanto na prévia (POST .../images)
// quanto na importação (POST .../images/:index/import), nunca para trocar
// as candidatas extraídas.
const extractHook = vi.hoisted(() => ({ onExtracted: null as null | (() => Promise<void>) }));
vi.mock('../src/services/pdfEmbeddedImages.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/pdfEmbeddedImages.js')>();
  return { ...actual, processPdfCandidateSandboxed: async (...args: Parameters<typeof actual.processPdfCandidateSandboxed>) => { const result = await actual.processPdfCandidateSandboxed(...args); if (processHook.onProcessed) await processHook.onProcessed(); return result; }, extractEmbeddedImages: async (...args: Parameters<typeof actual.extractEmbeddedImages>) => {
    const result = await actual.extractEmbeddedImages(...args);
    if (extractHook.onExtracted) await extractHook.onExtracted();
    return result;
  } };
});

// Fotos extraídas de PDF por empresa: ver src/services/pdfEmbeddedImages.ts
// (sandbox bwrap+prlimit, isolada e com testes próprios em
// tests/pdf-embedded-images.test.ts) e as duas rotas novas em
// organizationTripDocumentRoutes.ts (prévia privada e importação). Exige o
// ambiente real de sandbox — nunca mockado — por isso toda a suíte é pulada
// se bwrap/prlimit/pdfimages não existirem neste host.
const sandboxAvailable = existsSync('/usr/bin/pdfimages') && existsSync('/usr/bin/prlimit') && existsSync('/usr/bin/bwrap');

// Mesmo construtor de tests/pdf-embedded-images.test.ts: um PDF sintético
// mínimo, mas de verdade, com uma imagem JPEG embutida.
function pdfWithJpeg(jpeg: Buffer, width: number, height: number): Buffer {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let size = chunks[0].length;
  const add = (value: Buffer | string) => { const part = Buffer.isBuffer(value) ? value : Buffer.from(value); chunks.push(part); size += part.length; };
  const object = (index: number, content: Buffer | string) => { offsets[index] = size; add(`${index} 0 obj\n`); add(content); add('\nendobj\n'); };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  object(4, Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]));
  const content = 'q 250 0 0 250 20 20 cm /Im0 Do Q';
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = size;
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

let server: Server; let base: string; let storageDir: string; let mediaDir: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string;
let tripA: string; let tripB: string;
let pdfBuffer: Buffer;

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const previewUrl = (organizationId: string, tripId: string, documentId: string) =>
  `${base}/${organizationId}/tourism/trips/${tripId}/documents/${documentId}/images`;
const importUrl = (organizationId: string, tripId: string, documentId: string, index: number) =>
  `${previewUrl(organizationId, tripId, documentId)}/${index}/import`;

const createDocument = async (tripId: string) => {
  const stored = await storeScannedPdf(pdfBuffer);
  return prisma.tripDocument.create({ data: {
    tripId, storageKey: stored.key, originalFilename: 'roteiro.pdf', mimeType: 'application/pdf',
    sizeBytes: pdfBuffer.length, sha256: 'fixture', createdById: ownerId, scanStatus: 'CLEAN', extractionStatus: 'READY',
    retentionUntil: new Date(Date.now() + 60_000),
  } });
};

beforeAll(async () => {
  storageDir = await mkdtemp(join(tmpdir(), 'org-trip-doc-images-storage-'));
  mediaDir = await mkdtemp(join(tmpdir(), 'org-trip-doc-images-media-'));
  vi.stubEnv('DOCUMENT_STORAGE_DIR', storageDir);
  vi.stubEnv('DOCUMENT_CLAMDSCAN_PATH', SCANNER_PATH);
  vi.stubEnv('UPLOADS_DIR', mediaDir);
  vi.stubEnv('DOCUMENT_PDF_IMAGE_EXTRACTION_ENABLED', 'true');
  vi.stubEnv('DOCUMENT_PDFIMAGES_PATH', '/usr/bin/pdfimages');

  const jpeg = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#3e7199' } }).jpeg().toBuffer();
  pdfBuffer = pdfWithJpeg(jpeg, 100, 80);

  const owner = await prisma.user.create({ data: { email: `org-trip-doc-images-owner:${Date.now()}@example.test`, passwordHash: 'unused', role: 'editor' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-trip-doc-images-member:${Date.now()}@example.test`, passwordHash: 'unused', role: 'editor' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-trip-doc-images-stranger:${Date.now()}@example.test`, passwordHash: 'unused', role: 'editor' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Agência Fotos A', slug: `org-trip-doc-images-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência Fotos B', slug: `org-trip-doc-images-b-${Date.now()}` } })).id;
  await prisma.membership.create({ data: { userId: ownerId, organizationId: orgA, role: 'OWNER' } });
  await prisma.membership.create({ data: { userId: memberId, organizationId: orgA, role: 'MEMBER' } });
  await prisma.membership.create({ data: { userId: strangerId, organizationId: orgB, role: 'OWNER' } });

  tripA = (await prisma.trip.create({ data: {
    organizationId: orgA, title: 'Viagem A', category: 'Teste', description: 'privado', city: 'Cidade', region: 'PB',
    startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'leve', includes: '[]', media: '[]', storedIdentity: 'org-doc-images-trip-a',
  } })).id;
  tripB = (await prisma.trip.create({ data: {
    organizationId: orgB, title: 'Viagem B', category: 'Teste', description: 'privado', city: 'Cidade', region: 'PB',
    startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'leve', includes: '[]', media: '[]', storedIdentity: 'org-doc-images-trip-b',
  } })).id;

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  // Organization/Trip usam onDelete: Restrict (ver schema.prisma): o que
  // referencia a empresa precisa sair primeiro, nunca depois.
  await prisma.mediaAsset.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.trip.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(storageDir, { recursive: true, force: true });
  await rm(mediaDir, { recursive: true, force: true });
});

describe('fotos extraídas de PDF por empresa (prévia + importação)', () => {
  it('fica desativado por padrão: sem DOCUMENT_PDF_IMAGE_EXTRACTION_ENABLED/DOCUMENT_PDFIMAGES_PATH, 503 mesmo para o OWNER', async () => {
    const document = await createDocument(tripA);
    vi.stubEnv('DOCUMENT_PDF_IMAGE_EXTRACTION_ENABLED', '');
    try {
      expect((await fetch(previewUrl(orgA, tripA, document.id), { method: 'POST', headers: authHeaders(ownerToken) })).status).toBe(503);
    } finally {
      vi.stubEnv('DOCUMENT_PDF_IMAGE_EXTRACTION_ENABLED', 'true');
    }
  });

  it.skipIf(!sandboxAvailable)('exige sessão, papel de gestão (OWNER/ADMIN) e vínculo antes de extrair qualquer prévia', async () => {
    const document = await createDocument(tripA);
    expect((await fetch(previewUrl(orgA, tripA, document.id), { method: 'POST' })).status).toBe(401);
    expect((await fetch(previewUrl(orgA, tripA, document.id), { method: 'POST', headers: authHeaders(memberToken) })).status).toBe(403);
    expect((await fetch(previewUrl(orgA, tripA, document.id), { method: 'POST', headers: authHeaders(strangerToken) })).status).toBe(403);
  });

  it.skipIf(!sandboxAvailable)('nunca combina a viagem ou o documento de outra empresa com a prévia desta', async () => {
    const documentB = await createDocument(tripB);
    // documentId real, mas pela rota de orgA/tripA (não é dona): 404, nunca 403.
    expect((await fetch(previewUrl(orgA, tripA, documentB.id), { method: 'POST', headers: authHeaders(ownerToken) })).status).toBe(404);
    // tripId real de outra empresa, pela rota de orgA: idem.
    expect((await fetch(previewUrl(orgA, tripB, documentB.id), { method: 'POST', headers: authHeaders(ownerToken) })).status).toBe(404);
  });

  it.skipIf(!sandboxAvailable)('extrai a prévia real da sandbox sem publicar nem gravar nada — nenhum MediaAsset é criado', async () => {
    const document = await createDocument(tripA);
    const before = await prisma.mediaAsset.count({ where: { organizationId: orgA } });
    const response = await fetch(previewUrl(orgA, tripA, document.id), { method: 'POST', headers: authHeaders(ownerToken) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.images).toHaveLength(1);
    expect(body.images[0]).toMatchObject({ index: 0, page: 1, width: 100, height: 80 });
    expect(body.images[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(await prisma.mediaAsset.count({ where: { organizationId: orgA } })).toBe(before);
  });

  it.skipIf(!sandboxAvailable)('importa a foto escolhida como MediaAsset da própria empresa — nunca sem seleção, nunca para outra empresa', async () => {
    const document = await createDocument(tripA);
    // Índice inválido (nenhuma extração ainda aconteceu "selecionada"): 404, nunca grava nada.
    expect((await fetch(importUrl(orgA, tripA, document.id, 5), { method: 'POST', headers: authHeaders(ownerToken) })).status).toBe(404);

    const response = await fetch(importUrl(orgA, tripA, document.id, 0), { method: 'POST', headers: authHeaders(ownerToken) });
    expect(response.status).toBe(201);
    const asset = await response.json();
    expect(asset.storageKey).toBeUndefined();
    expect(asset.width).toBe(100);
    expect(asset.height).toBe(80);

    const stored = await prisma.mediaAsset.findUnique({ where: { id: asset.id } });
    expect(stored?.organizationId).toBe(orgA);
    expect(stored?.publishedAt).not.toBeNull();

    // MEMBER (vínculo com orgA, mas sem papel de gestão) e a empresa B
    // (nenhum vínculo com orgA) nunca importam, mesmo sabendo documentId e
    // índice — ambos 403, pelo mesmo middleware de papel/vínculo da rota
    // (requireOrganizationMembership), antes mesmo de chegar à viagem.
    expect((await fetch(importUrl(orgA, tripA, document.id, 0), { method: 'POST', headers: authHeaders(memberToken) })).status).toBe(403);
    expect((await fetch(importUrl(orgA, tripA, document.id, 0), { method: 'POST', headers: authHeaders(strangerToken) })).status).toBe(403);
  });

  it.skipIf(!sandboxAvailable)('revogado o vínculo ANTES de qualquer tentativa, a importação nem chega a extrair', async () => {
    const document = await createDocument(tripA);
    const before = await prisma.mediaAsset.count({ where: { organizationId: orgA } });
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    try {
      const response = await fetch(importUrl(orgA, tripA, document.id, 0), { method: 'POST', headers: authHeaders(ownerToken) });
      expect(response.status).toBe(403);
      expect(await prisma.mediaAsset.count({ where: { organizationId: orgA } })).toBe(before);
    } finally {
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'ACTIVE' } });
    }
  });

  it.skipIf(!sandboxAvailable)('revogado o vínculo DEPOIS de processar a imagem mas ANTES da transação que publica, nenhum MediaAsset fica gravado', async () => {
    const document = await createDocument(tripA);
    const before = await prisma.mediaAsset.count({ where: { organizationId: orgA } });
    processHook.onProcessed = async () => {
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    };
    try {
      const response = await fetch(importUrl(orgA, tripA, document.id, 0), { method: 'POST', headers: authHeaders(ownerToken) });
      expect(response.status).toBe(403);
      expect(await prisma.mediaAsset.count({ where: { organizationId: orgA } })).toBe(before);
    } finally {
      processHook.onProcessed = null;
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'ACTIVE' } });
    }
  });

  // A revisão independente apontou que a prévia só revalidava vínculo,
  // papel e documento ANTES da extração — nunca depois dela, embora a
  // extração (sandbox real, não instantânea) seja exatamente a janela em
  // que uma revogação, exclusão ou expiração pode acontecer. Os três testes
  // abaixo mutam o estado DENTRO da extração real (via extractHook, nunca
  // simulando o resultado) e provam que a segunda revalidação agora
  // acrescentada bloqueia a resposta — nenhuma foto privada escapa.
  it.skipIf(!sandboxAvailable)('vínculo revogado DURANTE a extração real: a prévia nunca devolve as fotos', async () => {
    const document = await createDocument(tripA);
    extractHook.onExtracted = async () => {
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    };
    try {
      const response = await fetch(previewUrl(orgA, tripA, document.id), { method: 'POST', headers: authHeaders(ownerToken) });
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.images).toBeUndefined();
    } finally {
      extractHook.onExtracted = null;
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'ACTIVE' } });
    }
  });

  it.skipIf(!sandboxAvailable)('documento excluído DURANTE a extração real: a prévia nunca devolve as fotos', async () => {
    const document = await createDocument(tripA);
    extractHook.onExtracted = async () => {
      await prisma.tripDocument.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
    };
    try {
      const response = await fetch(previewUrl(orgA, tripA, document.id), { method: 'POST', headers: authHeaders(ownerToken) });
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.images).toBeUndefined();
    } finally {
      extractHook.onExtracted = null;
      await prisma.tripDocument.update({ where: { id: document.id }, data: { deletedAt: null } });
    }
  });

  it.skipIf(!sandboxAvailable)('documento expirado DURANTE a extração real: a prévia nunca devolve as fotos', async () => {
    const document = await createDocument(tripA);
    extractHook.onExtracted = async () => {
      await prisma.tripDocument.update({ where: { id: document.id }, data: { retentionUntil: new Date(Date.now() - 1000) } });
    };
    try {
      const response = await fetch(previewUrl(orgA, tripA, document.id), { method: 'POST', headers: authHeaders(ownerToken) });
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.images).toBeUndefined();
    } finally {
      extractHook.onExtracted = null;
      await prisma.tripDocument.update({ where: { id: document.id }, data: { retentionUntil: new Date(Date.now() + 60_000) } });
    }
  });

  // Mesma lacuna, agora do lado da importação: o documento podia ser
  // excluído durante a extração sem que a rota jamais chegasse a
  // revalidá-lo de novo antes de processar/gravar. A checagem acrescentada
  // roda ANTES de qualquer registro pendente existir — por isso nada fica
  // para limpar depois: a contagem de MediaAsset nunca muda.
  it.skipIf(!sandboxAvailable)('documento excluído DURANTE a extração real: a importação não processa nem grava nada', async () => {
    const document = await createDocument(tripA);
    const before = await prisma.mediaAsset.count({ where: { organizationId: orgA } });
    extractHook.onExtracted = async () => {
      await prisma.tripDocument.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
    };
    try {
      const response = await fetch(importUrl(orgA, tripA, document.id, 0), { method: 'POST', headers: authHeaders(ownerToken) });
      expect(response.status).toBe(404);
      expect(await prisma.mediaAsset.count({ where: { organizationId: orgA } })).toBe(before);
    } finally {
      extractHook.onExtracted = null;
      await prisma.tripDocument.update({ where: { id: document.id }, data: { deletedAt: null } });
    }
  });

  // A revisão também apontou que, mesmo revalidando depois da extração, a
  // importação nunca reconferia o documento DENTRO da transação que
  // publica — só vínculo e viagem. Expira o documento bem depois do
  // processamento (já existe um MediaAsset pendente, nunca publicado) e
  // bem antes da transação abrir: a checagem nova dentro dela precisa
  // rejeitar e a limpeza de melhor esforço precisa remover o pendente, sem
  // deixar nenhum MediaAsset — publicado ou não — para trás.
  it.skipIf(!sandboxAvailable)('documento expira DEPOIS de processar a imagem mas ANTES da transação que publica: nenhum MediaAsset fica gravado', async () => {
    const document = await createDocument(tripA);
    const before = await prisma.mediaAsset.count({ where: { organizationId: orgA } });
    processHook.onProcessed = async () => {
      await prisma.tripDocument.update({ where: { id: document.id }, data: { retentionUntil: new Date(Date.now() - 1000) } });
    };
    try {
      const response = await fetch(importUrl(orgA, tripA, document.id, 0), { method: 'POST', headers: authHeaders(ownerToken) });
      expect(response.status).toBe(404);
      expect(await prisma.mediaAsset.count({ where: { organizationId: orgA } })).toBe(before);
    } finally {
      processHook.onProcessed = null;
      await prisma.tripDocument.update({ where: { id: document.id }, data: { retentionUntil: new Date(Date.now() + 60_000) } });
    }
  });
});
