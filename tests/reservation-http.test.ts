import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { prisma } from '../src/lib/prisma.js';

let server: Server;
let base: string;
let adminToken: string;
let userToken: string;
let tripId: string;
let reservationId: string;
let installmentId: string;
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const post = (path: string, data: unknown, token = adminToken, method = 'POST') => fetch(`${base}${path}`, { method, headers: headers(token), body: JSON.stringify(data) });

beforeAll(async () => {
  const admin = await prisma.user.create({ data: { email: 'reservation-admin@example.test', passwordHash: 'test', role: 'admin' } });
  const user = await prisma.user.create({ data: { email: 'reservation-user@example.test', passwordHash: 'test', role: 'user' } });
  adminToken = generateToken(admin); userToken = generateToken(user);
  const trip = await prisma.trip.create({ data: { title: 'Viagem teste', category: 'Teste', description: 'Viagem teste', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-01-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]', storedIdentity: 'reservation-http-test' } });
  tripId = trip.id;
  await new Promise<void>(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reservations`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });

describe('reservas administrativas', () => {
  it('restringe acesso e valida dados', async () => {
    const anonymous = await fetch(base);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toBe('no-store');
    expect((await fetch(base, { headers: headers(userToken) })).status).toBe(403);
    expect((await post('', { tripId, customerName: 'Pessoa', seats: 1, totalCents: -1 })).status).toBe(400);
    expect((await post('', { tripId: 'missing', customerName: 'Pessoa', seats: 1, totalCents: 10000 })).status).toBe(404);
  });
  it('registra e lista reservas sem alterar a disponibilidade da viagem', async () => {
    const before = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { spotsLeft: true } });
    const response = await post('', { tripId, customerName: 'Pessoa', seats: 2, totalCents: 10000 });
    expect(response.status).toBe(201);
    const row = await response.json() as { id: string; status: string };
    reservationId = row.id;
    expect(row.status).toBe('PENDING');
    const listing = await (await fetch(`${base}?tripId=${tripId}`, { headers: headers(adminToken) })).json() as { data: unknown[]; pagination: { total: number } };
    expect(listing.data).toHaveLength(1);
    expect(listing.pagination.total).toBe(1);
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { spotsLeft: true } })).toEqual(before);
  });
  it('impede excluir viagem com reserva e preserva ambos os registros', async () => {
    const tripUrl = `${base.replace('/reservations', '/trips')}/${tripId}`;
    const response = await fetch(tripUrl, { method: 'DELETE', headers: headers(adminToken) });
    expect(response.status).toBe(409);
    expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
    expect(await prisma.reservation.findUnique({ where: { id: reservationId } })).not.toBeNull();
  });
  it('pagina resultados e valida filtros e limites', async () => {
    expect((await post('', { tripId, customerName: 'Outra pessoa', seats: 1, totalCents: 3000 })).status).toBe(201);
    const first = await (await fetch(`${base}?tripId=${tripId}&page=1&limit=1`, { headers: headers(adminToken) })).json() as { data: { id: string }[]; pagination: { total: number; totalPages: number } };
    const second = await (await fetch(`${base}?tripId=${tripId}&page=2&limit=1`, { headers: headers(adminToken) })).json() as typeof first;
    expect(first.pagination).toMatchObject({ total: 2, totalPages: 2 });
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(1);
    expect(first.data[0].id).not.toBe(second.data[0].id);
    expect((await fetch(`${base}?limit=101`, { headers: headers(adminToken) })).status).toBe(400);
    expect((await fetch(`${base}?page=0`, { headers: headers(adminToken) })).status).toBe(400);
  });
  it('controla parcelas e conserva o total como centavos inteiros', async () => {
    expect((await post(`/${reservationId}/installments`, { amountCents: 0 })).status).toBe(400);
    expect((await post(`/${reservationId}/installments`, { amountCents: 1, dueDate: '2030-02-30' })).status).toBe(400);
    const response = await post(`/${reservationId}/installments`, { amountCents: 5000, dueDate: '2030-01-01' });
    expect(response.status).toBe(201);
    installmentId = (await response.json() as { id: string }).id;
    expect((await post(`/${reservationId}/installments`, { amountCents: 5001 })).status).toBe(409);
    expect((await post(`/${reservationId}`, { totalCents: 4999 }, adminToken, 'PATCH')).status).toBe(409);
    const paid = await post(`/${reservationId}/installments/${installmentId}`, { paid: true }, adminToken, 'PATCH');
    expect(paid.status).toBe(200);
    expect((await paid.json() as { paidAt: string }).paidAt).toBeTruthy();
    expect((await post(`/${reservationId}/installments/${installmentId}`, { dueDate: '2030-01-02' }, adminToken, 'PATCH')).status).toBe(409);
    expect((await post(`/inexistente/installments/${installmentId}`, { paid: false }, adminToken, 'PATCH')).status).toBe(404);
    expect((await post(`/${reservationId}/installments/${installmentId}`, { amountCents: 10001 }, adminToken, 'PATCH')).status).toBe(409);
    expect((await fetch(`${base}/${reservationId}/installments/${installmentId}`, { method: 'DELETE', headers: headers(adminToken) })).status).toBe(409);
    expect((await post(`/${reservationId}/installments/${installmentId}`, { paid: false }, adminToken, 'PATCH')).status).toBe(200);
    expect((await fetch(`${base}/${reservationId}/installments/${installmentId}`, { method: 'DELETE', headers: headers(adminToken) })).status).toBe(204);
    const replacement = await post(`/${reservationId}/installments`, { amountCents: 5000 });
    installmentId = (await replacement.json() as { id: string }).id;
  });
  it('impede alterar parcelas em reservas canceladas', async () => {
    expect((await post(`/${reservationId}`, { status: 'CANCELLED' }, adminToken, 'PATCH')).status).toBe(200);
    expect((await post(`/${reservationId}/installments`, { amountCents: 100 })).status).toBe(409);
    expect((await post(`/${reservationId}/installments/${installmentId}`, { paid: false }, adminToken, 'PATCH')).status).toBe(409);
  });
  it('preserva a associação do interessado com a viagem da reserva', async () => {
    const lead = await prisma.lead.create({ data: { name: 'Interessado da reserva', tripId } });
    const other = await prisma.trip.create({ data: { title: 'Outra viagem', category: 'Teste', description: 'Outra viagem', city: 'Cidade', region: 'PB', startDateISO: new Date('2030-02-01T12:00:00Z'), intensityClass: 'light', includes: '[]', media: '[]', storedIdentity: 'reservation-http-other' } });
    const linked = await post('', { tripId, leadId: lead.id, customerName: 'Pessoa vinculada', seats: 1, totalCents: 1000 });
    expect(linked.status).toBe(201);
    const saved = await linked.json() as { id: string; leadId: string };
    expect(saved.leadId).toBe(lead.id);
    const leadUrl = `${base.replace('/reservations', '/leads')}/${lead.id}`;
    expect((await fetch(leadUrl, { method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ tripId: other.id }) })).status).toBe(409);
    expect((await fetch(leadUrl, { method: 'DELETE', headers: headers(adminToken) })).status).toBe(409);
    expect((await post(`/${saved.id}`, { leadId: null }, adminToken, 'PATCH')).status).toBe(200);
    expect((await fetch(leadUrl, { method: 'DELETE', headers: headers(adminToken) })).status).toBe(204);
  });
});
