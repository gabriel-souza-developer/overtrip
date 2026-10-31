import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { toSiteDate } from '../src/services/publicTrips.js';
import { fetchTripsWithFallback } from '../js/data.js';

const prisma = new PrismaClient();
const TAG = `public-trips-test:${Date.now()}`;

let server: Server;
let baseUrl: string;
const ids: Record<string, string> = {};

const base = {
  category: 'Teste',
  description: 'Descrição',
  city: 'Cidade',
  region: 'PB',
  intensityClass: 'moderado',
  includes: JSON.stringify(['Item A']),
  media: JSON.stringify([{ src: 'assets/images/a.jpg', alt: 'Alt' }]),
};

async function makeTrip(key: string, status: string, startDateISO: Date, extra: Record<string, unknown> = {}) {
  const trip = await prisma.trip.create({
    data: { ...base, title: `${TAG} ${key}`, status, startDateISO, storedIdentity: `${TAG}:${key}`, ...extra },
  });
  ids[key] = trip.id;
  return trip;
}

const listPublic = async () => {
  const res = await fetch(`${baseUrl}/api/public/trips`);
  const body = (await res.json()) as any[];
  return { res, body, mine: body.filter((t) => String(t.title).startsWith(TAG)) };
};

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await makeTrip('draft', 'DRAFT', new Date('2030-01-10T09:00:00-03:00'));
  await makeTrip('open', 'OPEN', new Date('2030-03-10T09:00:00-03:00'), { publishedAt: new Date(), includes: JSON.stringify(['X', 'Y']) });
  await makeTrip('done', 'COMPLETED', new Date('2030-02-10T09:00:00-03:00'));
  await makeTrip('cancel', 'CANCELLED', new Date('2030-04-10T09:00:00-03:00'));
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { storedIdentity: { startsWith: TAG } } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/public/trips', () => {
  it('funciona sem login, com Cache-Control: no-cache', async () => {
    const { res } = await listPublic();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('rascunho não aparece; publicar faz aparecer; despublicar faz sumir', async () => {
    let { mine } = await listPublic();
    expect(mine.map((t) => t.title)).not.toContain(`${TAG} draft`);

    await prisma.trip.update({ where: { id: ids.draft }, data: { status: 'OPEN' } });
    ({ mine } = await listPublic());
    expect(mine.map((t) => t.title)).toContain(`${TAG} draft`);

    await prisma.trip.update({ where: { id: ids.draft }, data: { status: 'DRAFT' } });
    ({ mine } = await listPublic());
    expect(mine.map((t) => t.title)).not.toContain(`${TAG} draft`);
  });

  it('ordena por startDateISO crescente', async () => {
    const { body, mine } = await listPublic();
    const dates = body.map((t) => t.startDateISO as string);
    expect([...dates].sort()).toEqual(dates);
    expect(mine.map((t) => t.status)).toEqual(['completed', 'open', 'cancelled']);
  });

  it('status em minúsculas e campos JSON como arrays/objetos', async () => {
    const { mine } = await listPublic();
    const open = mine.find((t) => t.title.endsWith('open'));
    expect(open.status).toBe('open');
    expect(Array.isArray(open.includes)).toBe(true);
    expect(open.includes).toEqual(['X', 'Y']);
    expect(Array.isArray(open.media)).toBe(true);
    expect(open.media[0].src).toBe('assets/images/a.jpg');
    expect(Array.isArray(open.departures)).toBe(true);
    expect(open.intensityLabel).toBe('Intensidade moderada');
    expect(open.startDateISO).toBe('2030-03-10T09:00:00-03:00');
    for (const key of ['includedServices', 'itinerary', 'routeNotes', 'importantInfo']) {
      expect(open[key] === null || Array.isArray(open[key])).toBe(true);
    }
  });

  it('não expõe campos internos', async () => {
    const { mine } = await listPublic();
    const text = JSON.stringify(mine);
    for (const key of ['id', 'publishedAt', 'createdAt', 'updatedAt', 'storedIdentity', 'titleSearch', 'citySearch', 'categorySearch']) {
      for (const t of mine) expect(Object.keys(t)).not.toContain(key);
    }
    expect(text).not.toContain('"userId"');
  });

  it('CORS aberto sem credenciais só nesta rota', async () => {
    const pub = await fetch(`${baseUrl}/api/public/trips`, { headers: { Origin: 'https://qualquer.exemplo' } });
    expect(pub.headers.get('access-control-allow-origin')).toBe('*');
    expect(pub.headers.get('access-control-allow-credentials')).toBeNull();

    const priv = await fetch(`${baseUrl}/api/trips`, { headers: { Origin: 'https://qualquer.exemplo' } });
    expect(priv.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('/api/trips continua exigindo login; POST em /api/public/trips não existe', async () => {
    expect((await fetch(`${baseUrl}/api/trips`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/trips/${ids.open}`)).status).toBe(401);
    const post = await fetch(`${baseUrl}/api/public/trips`, { method: 'POST' });
    expect(post.status).toBe(404);
  });

  it('/api/generate-json foi removida', async () => {
    const res = await fetch(`${baseUrl}/api/generate-json`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('toSiteDate', () => {
  it('data só com dia (meia-noite UTC) não desloca o dia', () => {
    expect(toSiteDate(new Date('2026-11-29'))).toBe('2026-11-29');
  });
  it('meia-noite de São Paulo tem hora salva: não vira só o dia', () => {
    expect(toSiteDate(new Date('2026-11-29T00:00:00-03:00'))).toBe('2026-11-29T00:00:00-03:00');
  });
  it('limitação conhecida: 21:00 de São Paulo é indistinguível de data sem hora', () => {
    expect(toSiteDate(new Date('2026-11-28T21:00:00-03:00'))).toBe('2026-11-29');
  });
  it('com horário mantém o offset de São Paulo', () => {
    expect(toSiteDate(new Date('2026-09-13T03:30:00-03:00'))).toBe('2026-09-13T03:30:00-03:00');
    expect(toSiteDate(new Date('2026-09-14T01:00:00Z'))).toBe('2026-09-13T22:00:00-03:00');
  });
});

describe('contrato com trips.json', () => {
  const tripsJson = JSON.parse(readFileSync(resolve(__dirname, '../trips.json'), 'utf-8')) as any[];
  const CONTRACT_ID = `${TAG}:contract`;

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { storedIdentity: CONTRACT_ID } });
  });

  it('viagem importada mantém todos os campos que o site usa', async () => {
    const src = tripsJson[0];
    // Mesmo mapeamento de scripts/import-data.ts (mapTripFromJson / mapDepartures).
    const created = await prisma.trip.create({
      data: {
        storedIdentity: CONTRACT_ID,
        title: src.title,
        headlineDisplay: src.headlineDisplay || null,
        category: src.category,
        description: src.description,
        city: src.city,
        region: src.region,
        startDateISO: new Date(src.startDateISO),
        departureTime: src.departureTime || null,
        departureTolerance: src.departureTolerance || null,
        returnTime: src.returnTime || null,
        scheduleInfo: src.scheduleInfo || null,
        scheduleTBD: src.scheduleTBD || false,
        priceValue: src.priceValue ? parseFloat(src.priceValue) : null,
        priceDisplay: src.priceDisplay || null,
        priceUnit: src.priceUnit || 'por pessoa',
        free: src.free || false,
        intensityClass: src.intensityClass?.toLowerCase() || 'moderado',
        trailDistance: src.trailDistance || null,
        supportPoint: src.supportPoint || null,
        supportPointInfo: src.supportPointInfo || null,
        meetingCity: src.meetingCity || null,
        meetingPoint: src.meetingPoint || null,
        meetingDetails: src.meetingDetails || null,
        meetingMapsQuery: src.meetingMapsQuery || null,
        includes: JSON.stringify(src.includes || []),
        includesHighlight: src.includesHighlight || null,
        includedServices: JSON.stringify(src.includedServices || null),
        itinerary: JSON.stringify(src.itinerary || null),
        routeNotes: JSON.stringify(src.routeNotes || null),
        importantInfo: JSON.stringify(src.importantInfo || null),
        media: JSON.stringify(src.media || []),
        buttonLabel: src.buttonLabel || 'Quero viajar',
        buttonClass: src.buttonClass || 'button-dark',
        status: src.status?.toUpperCase() || 'OPEN',
        availabilitySchema: src.availabilitySchema || 'https://schema.org/InStock',
        departures: {
          create: src.departures.map((d: any, i: number) => ({
            time: d.time, place: d.place, city: d.city,
            mapsUrl: d.mapsUrl || null, mapsQuery: d.mapsQuery || null, orderIndex: i,
          })),
        },
      },
    });
    expect(created.id).toBeTruthy();

    const { body } = await listPublic();
    const got = body.find((t) => t.title === src.title && t.startDateISO === src.startDateISO);
    expect(got).toBeTruthy();

    // Campos que js/render.js e js/main.js leem: nenhum pode faltar.
    const used = [
      'title', 'headlineDisplay', 'category', 'description', 'city', 'region', 'meetingCity', 'meetingPoint',
      'meetingInfo', 'meetingDetails', 'meetingMapsQuery', 'departures', 'scheduleInfo', 'scheduleTBD',
      'dateDisplay', 'startDateISO', 'endDateISO', 'departureTime', 'departureTolerance', 'returnTime',
      'priceDisplay', 'priceUnit', 'priceValue', 'free', 'spotsLeft', 'intensityClass', 'intensityLabel',
      'includes', 'includesHighlight', 'includedServices', 'itinerary', 'routeNotes', 'importantInfo',
      'trailDistance', 'supportPoint', 'supportPointInfo', 'media', 'buttonLabel', 'buttonClass',
      'status', 'availabilitySchema',
    ];
    for (const key of used) expect(Object.keys(got), key).toContain(key);

    for (const key of [
      'title', 'headlineDisplay', 'category', 'description', 'city', 'region', 'meetingCity', 'meetingPoint',
      'meetingInfo', 'meetingDetails', 'meetingMapsQuery', 'departures', 'scheduleInfo', 'departureTime',
      'departureTolerance', 'returnTime', 'priceDisplay', 'priceUnit', 'intensityClass', 'intensityLabel',
      'includes', 'includesHighlight', 'includedServices', 'itinerary', 'routeNotes', 'importantInfo',
      'trailDistance', 'supportPoint', 'supportPointInfo', 'media', 'buttonLabel', 'buttonClass',
      'status', 'availabilitySchema', 'startDateISO',
    ]) {
      expect(got[key], key).toEqual(src[key]);
    }
    expect(got.priceValue).toBeCloseTo(Number(src.priceValue));
    expect(got.dateDisplay.startsWith('Domingo, 29/11/2026')).toBe(true);
  });
});

describe('fetchTripsWithFallback (queda para /trips.json)', () => {
  const jsonRes = (body: unknown, init: Partial<Response> = {}) =>
    ({ ok: true, status: 200, statusText: 'OK', json: async () => body, ...init }) as Response;

  it('usa a API quando responde um array, inclusive vazio', async () => {
    const calls: string[] = [];
    const warn = () => { throw new Error('não deveria avisar'); };
    const fetchFn = async (url: string) => { calls.push(url); return jsonRes([]); };
    expect(await fetchTripsWithFallback(fetchFn as any, { warn })).toEqual([]);
    expect(calls).toEqual(['/api/public/trips']);
  });

  it.each([
    ['erro de rede', async () => { throw new TypeError('fail'); }],
    ['HTTP 500', async () => jsonRes([], { ok: false, status: 500, statusText: 'x' })],
    ['HTML', async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => { throw new SyntaxError('<'); } }) as unknown as Response],
    ['objeto', async () => jsonRes({ a: 1 })],
  ])('cai para /trips.json em %s e avisa', async (_n, apiBehavior) => {
    const warnings: string[] = [];
    const fetchFn = async (url: string) => (url === '/api/public/trips' ? apiBehavior() : jsonRes([{ title: 'fallback' }]));
    const out = await fetchTripsWithFallback(fetchFn as any, { warn: (m: string) => warnings.push(m) });
    expect(out).toEqual([{ title: 'fallback' }]);
    expect(warnings).toHaveLength(1);
  });

  it('cai para /trips.json quando estoura o tempo limite', async () => {
    const warnings: string[] = [];
    const fetchFn = (url: string, opts: { signal?: AbortSignal }) =>
      url === '/api/public/trips'
        ? new Promise((_r, reject) => opts.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
        : Promise.resolve(jsonRes([{ title: 'fallback' }]));
    const out = await fetchTripsWithFallback(fetchFn as any, { timeoutMs: 20, warn: (m: string) => warnings.push(m) });
    expect(out).toEqual([{ title: 'fallback' }]);
    expect(warnings).toHaveLength(1);
  });
});
