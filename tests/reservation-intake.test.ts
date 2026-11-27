import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createReservationIntakeApp } from '../src/reservationIntakeApp.js';
import { derivedTotalCents, normalizeBrazilianPhone } from '../src/services/reservationIntake.js';
import { prisma } from '../src/lib/prisma.js';

// Dados fictícios. Nenhum dado de planilha real é usado aqui.
const secret = 'ef'.repeat(32);
const readSecret = 'ab'.repeat(32);
const TAG = `INTAKE TESTE ${Date.now()} - PB`;
const startDate = '2031-03-09';
const key = (label: string) => `wa1-${createHash('sha256').update(`${TAG}:${label}`).digest('hex')}`;
let server: Server; let url: string; let tripId: string;

const body = (overrides: Record<string, unknown> = {}) => ({
  tripTitle: TAG, tripStartDate: startDate, name: 'Pessoa Teste', phone: '(83) 99999-0001', seats: 2,
  customerConfirmed: true, privacyNoticeShown: true, ...overrides,
});
const post = (payload: unknown, idempotencyKey: string | null, auth = secret, extra: Record<string, string> = {}) => fetch(`${url}/n8n/v1/reservation-requests`, {
  method: 'POST',
  headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json', ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}), ...extra },
  body: typeof payload === 'string' ? payload : JSON.stringify(payload),
});

beforeAll(async () => {
  const trip = await prisma.trip.create({ data: {
    title: TAG, category: 'Teste', description: 'Descrição completa.', city: 'Cidade', region: 'PB', intensityClass: 'moderado',
    includes: JSON.stringify(['Item']), media: JSON.stringify([{ src: 'assets/images/a.jpg', alt: 'Alt' }]),
    status: 'OPEN', free: false, priceValue: 150.5, meetingTBD: true, spotsLeft: 1,
    startDateISO: new Date(`${startDate}T09:00:00-03:00`), storedIdentity: `${TAG}:trip`,
  } });
  tripId = trip.id;
  await new Promise<void>(resolve => { server = createReservationIntakeApp(secret, { readSecret }).listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.reservation.deleteMany({ where: { tripId } }); // cascata apaga os metadados
  await prisma.trip.delete({ where: { id: tripId } });
  await prisma.$disconnect();
});

describe('normalização de telefone', () => {
  it('aceita formatos brasileiros, inclusive o do WhatsApp sem o nono dígito', () => {
    expect(normalizeBrazilianPhone('(83) 99999-0001')).toBe('+5583999990001');
    expect(normalizeBrazilianPhone('+55 83 99999-0001')).toBe('+5583999990001');
    expect(normalizeBrazilianPhone('5583999990001')).toBe('+5583999990001');
    expect(normalizeBrazilianPhone('558388887777')).toBe('+5583988887777');
    expect(normalizeBrazilianPhone('0055 83 99999-0001')).toBe('+5583999990001');
    expect(normalizeBrazilianPhone('+55 0 83 99999-0001')).toBe('+5583999990001');
    expect(normalizeBrazilianPhone('083 3333-4444')).toBe('+558333334444');
    expect(normalizeBrazilianPhone('55 99999-0001')).toBe('+5555999990001');
  });
  it('recusa estrangeiros e inválidos', () => {
    expect(normalizeBrazilianPhone('+1 415 555 0100')).toBeNull();
    expect(normalizeBrazilianPhone('0044 20 7946 0000')).toBeNull();
    expect(normalizeBrazilianPhone('83 89999-0001')).toBeNull();
    expect(normalizeBrazilianPhone('abc')).toBeNull();
  });
});

describe('valor derivado da TRIP', () => {
  it('usa preço por pessoa × lugares, zero para gratuita e não converte outras unidades', () => {
    expect(derivedTotalCents({ free: false, priceValue: 150.5, priceUnit: 'por pessoa' }, 2)).toEqual({ totalCents: 30100, priced: true });
    expect(derivedTotalCents({ free: true, priceValue: 99, priceUnit: 'por pessoa' }, 3)).toEqual({ totalCents: 0, priced: true });
    expect(derivedTotalCents({ free: false, priceValue: 300, priceUnit: 'por casal' }, 2)).toEqual({ totalCents: 0, priced: false });
  });
});

describe('entrada de pedidos de reserva', () => {
  it('exige a credencial de escrita, separada da de leitura', async () => {
    expect((await post(body(), key('auth'), readSecret)).status).toBe(401);
    expect((await fetch(`${url}/n8n/v1/reservation-requests`, { method: 'POST' })).status).toBe(401);
    const same = createReservationIntakeApp(secret, { readSecret: secret }).listen(0, '127.0.0.1');
    await new Promise(resolve => same.once('listening', resolve));
    const sameUrl = `http://127.0.0.1:${(same.address() as AddressInfo).port}`;
    expect((await fetch(`${sameUrl}/n8n/v1/reservation-requests`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } })).status).toBe(401);
    await new Promise<void>(resolve => same.close(() => resolve()));
  });

  it('registra solicitação pendente sem pagamento, confirmação, interessado ou alteração de vagas', async () => {
    const first = await post(body(), key('first'));
    expect(first.status).toBe(201);
    const json = await first.json();
    expect(json).toMatchObject({ status: 'PENDING_HUMAN', recordedAs: 'RESERVATION_REQUEST_PENDING_DEPOSIT', outcome: 'CREATED', replayed: false, reservationConfirmed: false, paymentRegistered: false, seatsHeld: false, handoff: { required: true } });
    expect(JSON.stringify(json)).not.toContain('99999');
    expect(JSON.stringify(json)).not.toContain('Pessoa Teste');

    const rows = await prisma.reservation.findMany({ where: { tripId }, include: { installments: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'PENDING', source: 'WHATSAPP_N8N', needsReview: true, customerPhone: '+5583999990001', seats: 2, totalCents: 30100, leadId: null });
    expect(rows[0].installments).toHaveLength(0);
    expect(await prisma.lead.count({ where: { tripId } })).toBe(0);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).spotsLeft).toBe(1);
    const meta = await prisma.reservationIntakeRequest.findFirstOrThrow({ where: { reservationId: rows[0].id } });
    expect(JSON.stringify(meta)).not.toContain('99999');
  });

  it('repete de forma idempotente e recusa reuso da chave com outro conteúdo', async () => {
    const again = await post(body(), key('first'));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ outcome: 'CREATED', replayed: true });
    expect((await post(body({ seats: 3 }), key('first'))).status).toBe(409);
    expect(await prisma.reservation.count({ where: { tripId } })).toBe(1);
  });

  it('não duplica pedido do mesmo telefone (em outro formato) na mesma TRIP', async () => {
    const response = await post(body({ phone: '558399990001', seats: 1 }), key('second'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: 'DUPLICATE', replayed: false });
    expect(await prisma.reservation.count({ where: { tripId } })).toBe(1);
  });

  it('recusa campos extras, documentos, valores e pedidos não confirmados', async () => {
    for (const extra of [{ cpf: '00000000000' }, { priceValue: 1 }, { totalCents: 1 }, { paymentStatus: '100%' }, { email: 'a@b.c' }, { passengers: [] }]) {
      const response = await post(body(extra), key('extra'));
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain('00000000000');
    }
    expect((await post(body({ name: 'Pessoa 12345' }), key('digits'))).status).toBe(400);
    expect((await post(body({ privacyNoticeShown: false }), key('privacy'))).status).toBe(400);
    expect((await post(body({ customerConfirmed: false }), key('confirm'))).status).toBe(400);
    expect((await post(body({ phone: '+1 415 555 0100' }), key('foreign'))).status).toBe(422);
  });

  it('resolve a TRIP por título e data exatos e exige chave no formato fixo', async () => {
    expect((await post(body({ tripStartDate: '2031-03-10' }), key('date'))).status).toBe(404);
    expect((await post(body({ tripTitle: 'OUTRA TRIP - PB' }), key('title'))).status).toBe(404);
    expect((await post(body(), null)).status).toBe(400);
    expect((await post(body(), 'wa1-83999990001')).status).toBe(400);
    expect((await post('{', key('json'))).status).toBe(400);
    expect((await post(body(), key('type'), secret, { 'content-type': 'text/plain' })).status).toBe(415);
  });

  it('recusa TRIP esgotada pelo mesmo critério do catálogo', async () => {
    await prisma.trip.update({ where: { id: tripId }, data: { spotsLeft: 0 } });
    try {
      const response = await post(body({ phone: '(83) 99999-0002' }), key('soldout'));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: 'TRIP_SOLD_OUT', handoff: { required: true } });
    } finally {
      await prisma.trip.update({ where: { id: tripId }, data: { spotsLeft: 1 } });
    }
  });
});
