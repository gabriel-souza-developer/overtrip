import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateToken } from '../src/middleware/auth.js';
import { documentPath } from '../src/services/documentStorage.js';

// Scanner antivírus simulado — mesmo padrão de documents-http.test.ts
// (operador legado): nunca chama um binário real nos testes. onScan,
// quando definido, roda ANTES do retorno simulado do scanner — usado para
// revogar o vínculo enquanto a varredura está em andamento (ver teste de
// revogação durante o scan).
const scanner = vi.hoisted(() => ({ code: 0, onScan: null as null | (() => Promise<void>) }));
vi.mock('node:child_process', () => ({ execFile: (_bin: string, _args: string[], _options: unknown, callback: Function) => {
  void (async () => {
    if (scanner.onScan) await scanner.onScan();
    callback(scanner.code ? { code: scanner.code } : null);
  })();
} }));

// Provedor de IA simulado, só para a prova de revogação DURANTE a chamada
// (ver teste correspondente): nunca chama um provedor externo de verdade.
// Para as demais provas deste arquivo, provider permanece null — o mesmo
// caminho real de "ajuda de IA não está ativada" continua sendo exercido.
const fakeAi = vi.hoisted(() => ({ provider: null as null | { defaultModel: string; generate: (args: unknown) => Promise<unknown> } }));
vi.mock('../src/routes/aiRoutes.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/routes/aiRoutes.js')>();
  return { ...actual, envProvider: () => fakeAi.provider };
});

// Simula falha de disco na remoção física de um arquivo específico (pelo
// nome), sem afetar mkdtemp/readdir/rm usados pelo próprio teste nem o
// restante do serviço de armazenamento.
const diskFailure = vi.hoisted(() => ({ failPath: '' as string }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, unlink: (path: string) => {
    if (diskFailure.failPath && path === diskFailure.failPath) return Promise.reject(new Error('disco indisponível (simulado)'));
    return actual.unlink(path);
  } };
});

let server: Server; let base: string; let directory: string;
let ownerId: string; let ownerToken: string;
let memberId: string; let memberToken: string;
let strangerId: string; let strangerToken: string;
let orgA: string; let orgB: string;
let tripA: string; let tripB: string; let tripLegacy: string;
const identities = ['org-trip-docs-a', 'org-trip-docs-b', 'org-trip-docs-legacy'];
const pdf = '%PDF-1.7\nfixture';

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });
const uploadHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf', 'X-Document-Filename': 'roteiro.pdf' });
const docsUrl = (organizationId: string, tripId: string, documentId = '') =>
  `${base}/${organizationId}/tourism/trips/${tripId}/documents${documentId ? `/${documentId}` : ''}`;
const upload = (organizationId: string, tripId: string, token: string) => fetch(docsUrl(organizationId, tripId), { method: 'POST', headers: uploadHeaders(token), body: pdf });
// Cria o registro direto no banco e no storage (mesmo padrão de
// documents-http.test.ts), sem passar pela rota HTTP: usado nos testes que
// não avaliam o próprio envio, para não disputar o limite de 5 envios por
// minuto (ver router.post('/', createRateLimiter(...))) com os testes que o
// avaliam de fato.
const createDocument = async (tripId: string, filename = `direct-${Date.now()}.pdf`) => {
  const { storeScannedPdf } = await import('../src/services/documentStorage.js');
  const stored = await storeScannedPdf(Buffer.from(pdf));
  return { stored, document: await prisma.tripDocument.create({ data: {
    tripId, storageKey: stored.key, originalFilename: filename, mimeType: 'application/pdf',
    sizeBytes: pdf.length, sha256: 'fixture', createdById: ownerId, scanStatus: 'CLEAN', extractionStatus: 'PENDING',
    retentionUntil: new Date(Date.now() + 60_000),
  } }) };
};

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'org-trip-documents-'));
  vi.stubEnv('DOCUMENT_STORAGE_DIR', directory);
  vi.stubEnv('DOCUMENT_CLAMDSCAN_PATH', '/usr/bin/clamdscan');

  const owner = await prisma.user.create({ data: { email: `org-trip-docs-owner:${Date.now()}@example.test`, passwordHash: 'unused', role: 'editor' } });
  ownerId = owner.id; ownerToken = generateToken(owner);
  const member = await prisma.user.create({ data: { email: `org-trip-docs-member:${Date.now()}@example.test`, passwordHash: 'unused', role: 'editor' } });
  memberId = member.id; memberToken = generateToken(member);
  const stranger = await prisma.user.create({ data: { email: `org-trip-docs-stranger:${Date.now()}@example.test`, passwordHash: 'unused', role: 'editor' } });
  strangerId = stranger.id; strangerToken = generateToken(stranger);

  orgA = (await prisma.organization.create({ data: { name: 'Agência A', slug: `org-trip-docs-a-${Date.now()}` } })).id;
  orgB = (await prisma.organization.create({ data: { name: 'Agência B', slug: `org-trip-docs-b-${Date.now()}` } })).id;
  // owner é OWNER de A (pode gerenciar documentos); member é só MEMBER de A
  // (não deve ver nem mexer em documentos); stranger não tem vínculo com A.
  await prisma.membership.create({ data: { userId: ownerId, organizationId: orgA, role: 'OWNER' } });
  await prisma.membership.create({ data: { userId: memberId, organizationId: orgA, role: 'MEMBER' } });
  await prisma.membership.create({ data: { userId: strangerId, organizationId: orgB, role: 'OWNER' } });

  const commonTrip = { category: 'Teste', description: 'privado', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'leve', includes: '[]', media: '[]' };
  tripA = (await prisma.trip.create({ data: { ...commonTrip, organizationId: orgA, title: 'Viagem A', storedIdentity: identities[0] } })).id;
  tripB = (await prisma.trip.create({ data: { ...commonTrip, organizationId: orgB, title: 'Viagem B', storedIdentity: identities[1] } })).id;
  // organizationId nulo: viagem do acervo legado, nunca alcançável por rota de empresa.
  tripLegacy = (await prisma.trip.create({ data: { ...commonTrip, title: 'Viagem legada', storedIdentity: identities[2] } })).id;

  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/organizations`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.tripDocument.deleteMany({ where: { tripId: { in: [tripA, tripB, tripLegacy] } } });
  await prisma.trip.deleteMany({ where: { storedIdentity: { in: identities } } });
  await prisma.membership.deleteMany({ where: { userId: { in: [ownerId, memberId, strangerId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('PDFs do roteiro isolados por empresa (organizationTripDocumentRoutes)', () => {
  it('exige sessão, papel de gestão (OWNER/ADMIN) e vínculo com a empresa antes de qualquer leitura', async () => {
    expect((await fetch(docsUrl(orgA, tripA))).status).toBe(401);
    // MEMBER tem vínculo ativo, mas não é OWNER/ADMIN: nunca deve ver documentos.
    expect((await fetch(docsUrl(orgA, tripA), { headers: authHeaders(memberToken) })).status).toBe(403);
    // Sem vínculo algum com a empresa.
    expect((await fetch(docsUrl(orgA, tripA), { headers: authHeaders(strangerToken) })).status).toBe(403);
    // OWNER da própria empresa: acesso liberado.
    expect((await fetch(docsUrl(orgA, tripA), { headers: authHeaders(ownerToken) })).status).toBe(200);
  });

  it('nunca combina a viagem de outra empresa, nem a legada, com a rota desta empresa', async () => {
    // tripB pertence a orgB: pedir por ela via orgA nunca deve achar nada (404, nunca 403 que confirmaria existência).
    expect((await fetch(docsUrl(orgA, tripB), { headers: authHeaders(ownerToken) })).status).toBe(404);
    // tripLegacy não pertence a empresa alguma: idem.
    expect((await fetch(docsUrl(orgA, tripLegacy), { headers: authHeaders(ownerToken) })).status).toBe(404);
    // Confirma que a própria agência B consegue ver sua própria viagem (não é um problema geral de rota).
    expect((await fetch(docsUrl(orgB, tripB), { headers: authHeaders(strangerToken) })).status).toBe(200);
  });

  it('envia, lista, baixa e isola o PDF de uma empresa — outra empresa nunca o alcança', async () => {
    const response = await upload(orgA, tripA, ownerToken);
    expect(response.status).toBe(201);
    const document = await response.json();
    expect(document.storageKey).toBeUndefined();

    const list = await fetch(docsUrl(orgA, tripA), { headers: authHeaders(ownerToken) });
    expect((await list.json()).map((item: { id: string }) => item.id)).toContain(document.id);

    const download = await fetch(docsUrl(orgA, tripA, document.id), { headers: authHeaders(ownerToken) });
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(download.headers.get('cache-control')).toBe('no-store');
    expect(await download.text()).toBe(pdf);

    // Mesmo documentId, mas pela rota de orgB (empresa dona de tripB): nunca entrega o arquivo de outra empresa.
    expect((await fetch(docsUrl(orgB, tripB, document.id), { headers: authHeaders(strangerToken) })).status).toBe(404);
    // Pela rota de orgA mas pedindo pelo tripId de outra viagem (ainda que o documento exista): nunca combina.
    expect((await fetch(docsUrl(orgA, tripB, document.id), { headers: authHeaders(ownerToken) })).status).toBe(404);

    expect((await fetch(docsUrl(orgA, tripA, document.id), { method: 'DELETE', headers: authHeaders(ownerToken) })).status).toBe(204);
    expect(await readdir(directory)).toEqual([]);
  });

  it('recusa arquivo acima do limite e falha fechado quando o scanner recusa', async () => {
    // Assinatura falsa (400) já é coberta por tests/document-upload.test.ts
    // (unidade) e por documents-http.test.ts (a mesma rota compartilhada do
    // operador legado); não repetida aqui para não disputar à toa o limite
    // de 5 envios por minuto deste arquivo com os testes que o avaliam de fato.
    expect((await fetch(docsUrl(orgA, tripA), { method: 'POST', headers: uploadHeaders(ownerToken), body: '%PDF-' + 'a'.repeat(10 * 1024 * 1024) })).status).toBe(413);
    scanner.code = 1;
    const refused = await upload(orgA, tripA, ownerToken);
    expect(refused.status).toBe(422);
    expect(await readdir(directory)).toEqual([]);
    scanner.code = 2;
    const unavailable = await upload(orgA, tripA, ownerToken);
    expect(unavailable.status).toBe(503);
    expect(await readdir(directory)).toEqual([]);
    scanner.code = 0;
  });

  it('revogado o vínculo DURANTE a varredura antivírus, o envio é recusado depois e o arquivo escaneado não fica retido', async () => {
    // A varredura roda antes da transação que grava o metadado (ver
    // storeScannedPdf, chamado antes do prisma.$transaction na rota). Aqui
    // a revogação acontece DENTRO do próprio scanner simulado, provando que
    // a revalidação da transação (assertOrganizationWriteAccess) continua
    // pegando uma revogação que aconteceu só depois que o scan já começou.
    scanner.onScan = async () => {
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    };
    try {
      const response = await upload(orgA, tripA, ownerToken);
      expect(response.status).toBe(403);
      expect(await prisma.tripDocument.findFirst({ where: { tripId: tripA, originalFilename: 'roteiro.pdf' } })).toBeNull();
      // O arquivo já escaneado (aprovado) não fica esquecido no storage: o
      // catch da rota o remove ao ver a transação falhar.
      expect(await readdir(directory)).toEqual([]);
    } finally {
      scanner.onScan = null;
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'ACTIVE' } });
    }
  });

  it('MEMBER nunca consegue enviar, nem excluir, mesmo sabendo o documentId', async () => {
    const { document } = await createDocument(tripA);
    // O envio em si (POST /) também é testado à parte: aqui o que importa é
    // que um MEMBER nunca consiga enviar nem excluir, mesmo sabendo o id.
    expect((await upload(orgA, tripA, memberToken)).status).toBe(403);
    expect((await fetch(docsUrl(orgA, tripA, document.id), { method: 'DELETE', headers: authHeaders(memberToken) })).status).toBe(403);
    // Confirma que o documento sobreviveu às tentativas do MEMBER.
    expect((await fetch(docsUrl(orgA, tripA, document.id), { headers: authHeaders(ownerToken) })).status).toBe(200);
    await fetch(docsUrl(orgA, tripA, document.id), { method: 'DELETE', headers: authHeaders(ownerToken) });
  });

  it('revalida o vínculo a cada requisição: revogar o acesso de OWNER bloqueia a rota na mesma sessão', async () => {
    const { document } = await createDocument(tripA);
    await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
    try {
      expect((await fetch(docsUrl(orgA, tripA), { headers: authHeaders(ownerToken) })).status).toBe(403);
      expect((await fetch(docsUrl(orgA, tripA, document.id), { headers: authHeaders(ownerToken) })).status).toBe(403);
      expect((await fetch(docsUrl(orgA, tripA, document.id), { method: 'DELETE', headers: authHeaders(ownerToken) })).status).toBe(403);
    } finally {
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'ACTIVE' } });
      await fetch(docsUrl(orgA, tripA, document.id), { method: 'DELETE', headers: authHeaders(ownerToken) });
    }
  });

  it('se a remoção física falhar após excluir o metadado, o documento já não existe para leitura e o arquivo órfão sobrevive para a limpeza periódica', async () => {
    const { stored, document } = await createDocument(tripA, 'disk-failure.pdf');
    const fullPath = documentPath(stored.directory, stored.key);
    diskFailure.failPath = fullPath;
    try {
      const deletion = await fetch(docsUrl(orgA, tripA, document.id), { method: 'DELETE', headers: authHeaders(ownerToken) });
      // Mesmo com a remoção física falhando, o metadado já saiu na mesma
      // transação revalidada: a resposta reflete o estado real (apagado).
      expect(deletion.status).toBe(204);
      expect(await prisma.tripDocument.findUnique({ where: { id: document.id } })).toBeNull();
      expect((await fetch(docsUrl(orgA, tripA, document.id), { headers: authHeaders(ownerToken) })).status).toBe(404);
      const list = await (await fetch(docsUrl(orgA, tripA), { headers: authHeaders(ownerToken) })).json();
      expect(list.map((item: { id: string }) => item.id)).not.toContain(document.id);
      // O arquivo nunca é perdido nem corrompido: continua no mesmo lugar, à espera da próxima limpeza.
      expect(await readdir(stored.directory)).toContain(stored.key);
    } finally {
      diskFailure.failPath = '';
      await rm(fullPath, { force: true });
    }
  });

  it('mesmo se documentDirectory() falhar (não só o unlink) depois de excluir o metadado, a resposta reflete o estado real', async () => {
    // Caso distinto do teste anterior: lá quem falha é o unlink de um
    // arquivo específico; aqui é a própria resolução do diretório privado
    // (ver documentDirectory em documentStorage.ts) que falha — por
    // exemplo, por DOCUMENT_STORAGE_DIR ter ficado indisponível entre a
    // revalidação e a limpeza. O catch da rota precisa cobrir os dois.
    const { document } = await createDocument(tripA, 'disk-failure-directory.pdf');
    vi.stubEnv('DOCUMENT_STORAGE_DIR', '');
    try {
      const deletion = await fetch(docsUrl(orgA, tripA, document.id), { method: 'DELETE', headers: authHeaders(ownerToken) });
      expect(deletion.status).toBe(204);
      expect(await prisma.tripDocument.findUnique({ where: { id: document.id } })).toBeNull();
    } finally {
      vi.stubEnv('DOCUMENT_STORAGE_DIR', directory);
    }
  });

  it('isola a geração de sugestões por empresa, viagem, estado e prazo — nunca entrega a de outra empresa', async () => {
    const document = await prisma.tripDocument.create({ data: {
      tripId: tripA, storageKey: `org-doc-suggestion-${Date.now()}.pdf`, originalFilename: 'suggestion.pdf', mimeType: 'application/pdf',
      sizeBytes: pdf.length, sha256: 'fixture', createdById: ownerId, scanStatus: 'CLEAN', extractionStatus: 'PENDING',
      retentionUntil: new Date(Date.now() + 60_000),
    } });
    try {
      const endpoint = (organizationId: string, tripId: string) => `${docsUrl(organizationId, tripId, document.id)}/suggestions`;
      const request = (u: string, token = ownerToken) => fetch(u, { method: 'POST', headers: authHeaders(token) });
      // Ainda não extraído (READY): 404, nunca revela o documento a outra empresa.
      expect((await request(endpoint(orgA, tripA))).status).toBe(404);
      await prisma.tripDocument.update({ where: { id: document.id }, data: { extractionStatus: 'READY' } });
      // Mesmo documentId, mas pela empresa B (não dona da viagem): nunca combina.
      expect((await request(endpoint(orgB, tripB), strangerToken)).status).toBe(404);
      // MEMBER da empresa dona: ainda bloqueado pelo papel, antes mesmo de tocar no documento.
      expect((await request(endpoint(orgA, tripA), memberToken)).status).toBe(403);

      vi.stubEnv('DOCUMENT_AI_EXTERNAL_ENABLED', '');
      const disabled = await request(endpoint(orgA, tripA));
      expect(disabled.status).toBe(503);
      vi.stubEnv('DOCUMENT_AI_EXTERNAL_ENABLED', 'true');
      vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('GOOGLE_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', '');
      const unavailable = await request(endpoint(orgA, tripA));
      expect(unavailable.status).toBe(503);
      expect(unavailable.headers.get('cache-control')).toBe('no-store');

      await prisma.tripDocument.update({ where: { id: document.id }, data: { retentionUntil: new Date(0) } });
      expect((await request(endpoint(orgA, tripA))).status).toBe(404);
    } finally {
      await prisma.tripDocument.delete({ where: { id: document.id } }).catch(() => {});
    }
  });

  it('revogado o vínculo DURANTE a chamada de IA, a sugestão nunca é devolvida ao cliente', async () => {
    // generateDocumentSuggestions (ver src/services/documentSuggestions.ts)
    // já revalida vínculo/papel/viagem/documento ANTES e DEPOIS da chamada
    // ao provedor — aqui a revogação acontece DENTRO do próprio provedor
    // simulado (generate), provando que a revalidação de DEPOIS pega uma
    // revogação concorrente ao próprio tempo de resposta da IA.
    const pageText = 'Vagas restantes: 4 pessoas.';
    const document = await prisma.tripDocument.create({ data: {
      tripId: tripA, storageKey: `org-doc-ai-revoke-${Date.now()}.pdf`, originalFilename: 'roteiro-ia.pdf', mimeType: 'application/pdf',
      sizeBytes: pdf.length, sha256: 'fixture', createdById: ownerId, scanStatus: 'CLEAN', extractionStatus: 'READY',
      retentionUntil: new Date(Date.now() + 60_000), pages: { create: [{ pageNumber: 1, text: pageText }] },
    } });
    vi.stubEnv('DOCUMENT_AI_EXTERNAL_ENABLED', 'true');
    fakeAi.provider = {
      defaultModel: 'fake-model-simulado',
      generate: async () => {
        await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'REVOKED' } });
        return {
          stopReason: 'stop',
          object: {
            title: null, headlineDisplay: null, category: null, description: null, city: null, region: null,
            startDate: null, endDate: null, departureTime: null, departureTolerance: null, returnTime: null, scheduleInfo: null,
            priceValue: null, priceUnit: null, free: null, intensityClass: null, spotsLeft: 4, trailDistance: null,
            supportPoint: null, supportPointInfo: null, meetingCity: null, meetingPoint: null, meetingDetails: null,
            includes: null, includedServices: null, itinerary: null, routeNotes: null, importantInfo: null,
            warnings: [],
            sources: [{ field: 'spotsLeft', page: 1, excerpt: 'Vagas restantes: 4 pessoas.' }],
          },
        };
      },
    };
    try {
      const response = await fetch(`${docsUrl(orgA, tripA, document.id)}/suggestions`, { method: 'POST', headers: authHeaders(ownerToken) });
      // Nunca 200 com o rascunho: a IA (simulada) até respondeu, mas o
      // vínculo já não valia mais quando a resposta chegou.
      expect(response.status).toBe(403);
    } finally {
      fakeAi.provider = null;
      vi.stubEnv('DOCUMENT_AI_EXTERNAL_ENABLED', '');
      await prisma.membership.update({ where: { organizationId_userId: { organizationId: orgA, userId: ownerId } }, data: { status: 'ACTIVE' } });
      await prisma.tripDocument.delete({ where: { id: document.id } }).catch(() => {});
    }
  });
});
