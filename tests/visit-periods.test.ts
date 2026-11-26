import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { generateToken } from '../src/middleware/auth.js';
import { normalizeForSearch } from '../src/utils/searchUtils.js';
import { periodBounds, summarizeVisitPeriods } from '../src/utils/siteMonth.js';
import { monthOptions, yearOptions } from '../frontend/src/lib/visitPeriods.js';

// Filtro mês/ano de "Destinos visitados": usa o dia civil que o site mostra
// (meia-noite UTC = data sem hora; demais instantes pelo dia de São Paulo).

const prisma = new PrismaClient();
const TAG = `visit-periods-test-${Date.now()}`;
let server: Server;
let baseUrl: string;
let token: string;
let userId: string;

const list = async (query: string) => {
  const response = await fetch(`${baseUrl}/api/visits?search=${encodeURIComponent(TAG)}&limit=100${query}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
};

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const user = await prisma.user.create({ data: { email: `test:${TAG}@example.com`, passwordHash: 'unused', role: 'admin', legacyAccess: true } });
  userId = user.id;
  token = generateToken(user);
  const make = (key: string, date: string | null) => prisma.visit.create({ data: {
    title: `${TAG} ${key}`, titleSearch: normalizeForSearch(`${TAG} ${key}`), city: 'Areia', region: 'PB', date: date ? new Date(date) : null, storedIdentity: `test:${TAG}:${key}`,
  } });
  await make('julho-sp', '2026-07-31T23:30:00.000-03:00'); // 02:30Z de 1º/ago, mas 31/jul em São Paulo
  await make('agosto-sem-hora', '2026-08-01T00:00:00.000Z'); // data sem hora: 1º/ago
  await make('agosto-fim', '2026-08-31T20:00:00.000-03:00');
  await make('setembro-sem-hora', '2026-09-01T00:00:00.000Z');
  await make('dezembro-2025', '2025-12-31T12:00:00.000Z');
  await make('sem-data', null);
});

afterAll(async () => {
  await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: `test:${TAG}` } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const titles = (body: { data: { title: string }[] }) => body.data.map((row) => row.title.replace(`${TAG} `, '')).sort();

describe('filtro mês/ano de destinos visitados', () => {
  it('filtra pelo mês no dia civil do site, incluindo datas sem hora nas bordas', async () => {
    expect(titles((await list('&year=2026&month=8')).body)).toEqual(['agosto-fim', 'agosto-sem-hora']);
    expect(titles((await list('&year=2026&month=7')).body)).toEqual(['julho-sp']);
    expect(titles((await list('&year=2026&month=9')).body)).toEqual(['setembro-sem-hora']);
  });

  it('filtra pelo ano inteiro e recusa mês sem ano ou fora do intervalo', async () => {
    expect(titles((await list('&year=2026')).body)).toEqual(['agosto-fim', 'agosto-sem-hora', 'julho-sp', 'setembro-sem-hora']);
    expect(titles((await list('&year=2025&month=12')).body)).toEqual(['dezembro-2025']);
    expect((await list('&month=8')).status).toBe(400);
    expect((await list('&year=2026&month=13')).status).toBe(400);
  });

  it('consulta o histórico de meses com visitas para montar o filtro', async () => {
    const response = await fetch(`${baseUrl}/api/visits/periods`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.periods).toEqual(expect.arrayContaining([{ year: 2026, month: 8, count: expect.any(Number) }, { year: 2025, month: 12, count: expect.any(Number) }]));
    expect((await fetch(`${baseUrl}/api/visits/periods`)).status).toBe(401);
  });

  it('agrupa e ordena os períodos do mais recente ao mais antigo', () => {
    const summary = summarizeVisitPeriods([new Date('2026-08-01T00:00:00.000Z'), new Date('2026-08-01T02:30:00.000Z'), new Date('2025-12-31T12:00:00.000Z'), null]);
    expect(summary).toEqual({ periods: [{ year: 2026, month: 8, count: 1 }, { year: 2026, month: 7, count: 1 }, { year: 2025, month: 12, count: 1 }], undated: 1 });
    expect(periodBounds(2026, 12)).toEqual(['2026-12-01', '2027-01-01']);
    expect(periodBounds(2026)).toEqual(['2026-01-01', '2027-01-01']);
  });

  it('opções do painel: anos com contagem e meses do ano escolhido, preservando a escolha do endereço', () => {
    const periods = { periods: [{ year: 2026, month: 8, count: 2 }, { year: 2026, month: 7, count: 1 }, { year: 2025, month: 12, count: 1 }], undated: 1 };
    expect(yearOptions(periods)).toEqual([{ value: '2026', label: '2026 (3 visitas)' }, { value: '2025', label: '2025 (1 visita)' }]);
    expect(monthOptions(periods, '2026')).toEqual([{ value: '7', label: 'Julho (1 visita)' }, { value: '8', label: 'Agosto (2 visitas)' }]);
    expect(monthOptions(periods, '')).toEqual([]);
    expect(yearOptions(periods, '2020').map((option) => option.value)).toContain('2020');
    expect(monthOptions(periods, '2026', '3')[0]).toEqual({ value: '3', label: 'Março (0 visitas)' });
  });
});
