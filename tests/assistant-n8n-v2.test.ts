import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAssistantPrivateApp } from '../src/assistantPrivateApp.js';
import { buildN8nKnowledge, toN8nV2Trip } from '../src/services/assistantN8nV2.js';
import { prisma } from '../src/lib/prisma.js';

const baseKnowledge = {
  company: { name: 'OVERTRIP' },
  reservation: { depositPercentage: 50, remainingPaymentDeadline: 'até 48 horas antes do embarque' },
  faq: [{ id: 'arquivo', question: 'Pergunta do arquivo?', answer: 'Resposta do arquivo.' }],
};

describe('base de conhecimento v2 para o n8n', () => {
  it('usa a FAQ do arquivo enquanto não houver versão aprovada no painel', () => {
    const result = buildN8nKnowledge(baseKnowledge, null);
    expect(result.faq).toEqual(baseKnowledge.faq);
    expect(result.knowledgeVersion).toBeNull();
  });

  it('substitui a FAQ pela versão aprovada e mantém as regras de reserva (50% de entrada)', () => {
    const result = buildN8nKnowledge(baseKnowledge, { version: 7, entries: [{ question: 'Aprovada?', answer: 'Sim.' }] });
    expect(result.faq).toEqual([{ id: 'painel-v7-1', question: 'Aprovada?', answer: 'Sim.' }]);
    expect(result.reservation.depositPercentage).toBe(50);
    expect(result.knowledgeVersion).toBe(7);
  });

  it('uma versão aprovada vazia remove a FAQ ativa', () => {
    expect(buildN8nKnowledge(baseKnowledge, { version: 2, entries: [] }).faq).toEqual([]);
  });

  it('aceita o knowledge.json real do projeto com 50% de entrada', async () => {
    const { readFileSync } = await import('node:fs');
    const real = buildN8nKnowledge(JSON.parse(readFileSync('knowledge.json', 'utf8')), null);
    expect(real.reservation.depositPercentage).toBe(50);
    expect(real.faq.length).toBeGreaterThan(0);
  });

  it('recusa arquivo sem regras de reserva ou FAQ', () => {
    expect(() => buildN8nKnowledge({ company: {} }, null)).toThrow();
  });
});

describe('viagens v2 para o n8n', () => {
  const row = {
    id: 'interno', title: 'Trilha', headlineDisplay: null, category: 'Trilha', description: 'Passeio', city: 'Cidade', region: 'PB',
    meetingCity: 'Campina Grande', meetingPoint: 'Praça', meetingTBD: false, meetingDetails: null, meetingMapsQuery: null,
    departures: [], scheduleInfo: null, scheduleTBD: false, startDateISO: new Date('2030-01-05T00:00:00Z'), endDateISO: null,
    departureTime: '05:00', departureTolerance: null, returnTime: '18:00', priceDisplay: 'R$ 120,00', priceUnit: 'por pessoa',
    priceValue: 120, free: false, spotsLeft: null, intensityClass: 'moderado', includes: '["Guia"]', includesHighlight: null,
    includedServices: null, itinerary: null, routeNotes: '["Trecho de areia"]', importantInfo: null, trailDistance: '8 km',
    supportPoint: null, supportPointInfo: null, media: '[{"src":"a.webp"}]', buttonLabel: 'Quero', buttonClass: 'button-dark',
    status: 'OPEN', availabilitySchema: 'https://schema.org/InStock', internalNote: 'privado',
  };

  it('entrega os campos que a ficha do fluxo usa, sem mídia, botões ou campos internos', () => {
    const trip = toN8nV2Trip(row as never)!;
    expect(trip).toMatchObject({ title: 'Trilha', status: 'open', intensityLabel: 'Intensidade moderada', meetingInfo: 'Campina Grande (Praça)', routeNotes: ['Trecho de areia'], trailDistance: '8 km', handoffRequiredForBooking: true });
    for (const key of ['id', 'media', 'buttonLabel', 'buttonClass', 'internalNote', 'availabilitySchema']) expect(trip).not.toHaveProperty(key);
  });
});

describe('rotas v2 do serviço privado', () => {
  const secret = 'ef'.repeat(32);
  const dir = mkdtempSync(join(tmpdir(), 'overtrip-kb-'));
  const file = join(dir, 'knowledge.json');
  let server: Server; let url: string;
  const headers = { authorization: `Bearer ${secret}` };

  beforeAll(async () => {
    writeFileSync(file, JSON.stringify(baseKnowledge));
    await new Promise<void>(resolve => { server = createAssistantPrivateApp(secret, { knowledgeFile: file }).listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it('exige a credencial do serviço', async () => {
    expect((await fetch(`${url}/n8n/v2/trips`)).status).toBe(401);
    expect((await fetch(`${url}/n8n/v2/knowledge`)).status).toBe(401);
  });

  it('entrega viagens como lista e a base estruturada', async () => {
    const trips = await fetch(`${url}/n8n/v2/trips`, { headers });
    expect(trips.status).toBe(200);
    expect(Array.isArray(await trips.json())).toBe(true);
    const knowledge = await fetch(`${url}/n8n/v2/knowledge`, { headers });
    expect(knowledge.status).toBe(200);
    expect(await knowledge.json()).toMatchObject({ company: { name: 'OVERTRIP' }, reservation: { depositPercentage: 50 } });
  });

  it('responde 503 quando o arquivo da base está inválido', async () => {
    writeFileSync(file, '{"quebrado"');
    expect((await fetch(`${url}/n8n/v2/knowledge`, { headers })).status).toBe(503);
    writeFileSync(file, JSON.stringify(baseKnowledge));
  });
});
