import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { saoPauloDateKey, tripPeriodWhere } from '../src/utils/tripPeriod.js';

const prisma = new PrismaClient();

describe('período das viagens (dia de São Paulo)', () => {
  it('o dia de hoje segue America/Sao_Paulo, não o UTC', () => {
    expect(saoPauloDateKey(new Date('2026-11-10T02:30:00Z'))).toBe('2026-11-09');
    expect(saoPauloDateKey(new Date('2026-11-10T03:00:00Z'))).toBe('2026-11-10');
  });

  it('próximas: hoje (data sem hora ou a partir de 00:00 de São Paulo) em diante', () => {
    const now = new Date('2026-11-10T15:00:00Z');
    expect(tripPeriodWhere('upcoming', now)).toEqual({ AND: [
      { OR: [
        { startDateISO: { gte: new Date('2026-11-10T03:00:00.000Z') } },
        { startDateISO: new Date('2026-11-10T00:00:00.000Z') },
      ] },
      { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    ] });
    expect(tripPeriodWhere('past', now)).toEqual({ AND: [
      { startDateISO: { lt: new Date('2026-11-10T03:00:00.000Z') } },
      { startDateISO: { not: new Date('2026-11-10T00:00:00.000Z') } },
    ] });
  });
});

describe('GET /api/trips?period=', () => {
  let server: Server;
  let base: string;
  let token: string;
  let userId: string;
  const tag = `period-${Date.now()}`;
  const ids: string[] = [];
  const today = saoPauloDateKey();
  const day = (offset: number) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

  const make = async (title: string, startDateISO: Date, status = 'DRAFT') => {
    const trip = await prisma.trip.create({ data: {
      title: `${tag} ${title}`, category: 'Trilha', description: 'x', city: 'Lucena', region: 'PB', startDateISO, status,
      intensityClass: 'moderado', includes: '[]', media: '[]', meetingTBD: true, storedIdentity: `${tag}:${title}`,
      titleSearch: `${tag} ${title}`.toLowerCase(), citySearch: 'lucena', categorySearch: 'trilha',
    } });
    ids.push(trip.id);
  };

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `${tag}@example.test`, passwordHash: 'x', role: 'admin' } });
    userId = user.id;
    token = generateToken(user);
    await make('futura', new Date(`${day(30)}T00:00:00.000Z`));
    await make('hoje sem hora', new Date(`${today}T00:00:00.000Z`));
    await make('hoje com hora', new Date(`${today}T08:30:00.000Z`));
    await make('ontem a noite', new Date(`${today}T01:00:00.000Z`)); // 22:00 de ontem em São Paulo
    await make('passada', new Date(`${day(-30)}T00:00:00.000Z`));
    await make('concluída com data futura inconsistente', new Date(`${day(5)}T00:00:00.000Z`), 'COMPLETED');
    await make('cancelada com data futura inconsistente', new Date(`${day(6)}T00:00:00.000Z`), 'CANCELLED');
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/trips`;
  });

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  const titles = async (query: string) => {
    const response = await fetch(`${base}?search=${encodeURIComponent(tag)}&limit=100${query}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ title: string }> };
    return body.data.map((trip) => trip.title.replace(`${tag} `, ''));
  };

  it('próximas: hoje e futuras, da mais perto para a mais distante', async () => {
    expect(await titles('&period=upcoming')).toEqual(['hoje sem hora', 'hoje com hora', 'futura']);
  });

  it('anteriores: passadas e a de ontem à noite, da mais recente para a mais antiga', async () => {
    expect(await titles('&period=past')).toEqual(['ontem a noite', 'passada']);
  });

  it('sem período: todas', async () => {
    expect((await titles('')).length).toBe(7);
  });

  it('período inválido é recusado', async () => {
    const response = await fetch(`${base}?period=amanha`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(400);
  });
});
