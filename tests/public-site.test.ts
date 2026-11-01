import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import app from '../src/app.js';
import { visitService } from '../src/services/index.js';
import { orderGallery, resolveGallery, mergeDestinations, fetchPublicArray } from '../js/publicData.js';

const prisma = new PrismaClient();
const TAG = `public-site-test:${Date.now()}`;
let server: Server;
let baseUrl: string;
const ids: Record<string, string> = {};

const img = JSON.stringify([{ src: 'assets/images/a.jpg', alt: 'A', extra: 'x' }]);
const gal = (key: string, date: string, extra: Record<string, unknown> = {}) =>
  prisma.galleryEntry.create({
    data: { title: `${TAG} ${key}`, date: new Date(date), dateDisplay: 'texto', description: 'D', images: img, orderIndex: 0, storedIdentity: `${TAG}:g:${key}`, ...extra },
  });
const visit = async (key: string, data: Record<string, unknown>) => {
  const v = await prisma.visit.create({ data: { title: `${TAG} ${key}`, city: 'Lucena', region: 'PB', storedIdentity: `${TAG}:v:${key}`, ...data } });
  ids[key] = v.id;
  return v;
};

beforeAll(async () => {
  await new Promise<void>((r) => { server = app.listen(0, r); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await gal('old', '2000-01-10');
  await gal('new', '2000-06-10');
  await gal('feat', '1999-03-05', { isFeatured: true });
  await visit('ok', { needsReview: false, lat: -6.5, lng: -34.5, date: new Date('2026-10-18') });
  await visit('pending', { needsReview: true, lat: -6.6, lng: -34.6 });
  await visit('nocoords', { needsReview: false });
});

afterAll(async () => {
  await prisma.galleryEntry.deleteMany({ where: { storedIdentity: { startsWith: TAG } } });
  await prisma.visit.deleteMany({ where: { storedIdentity: { startsWith: TAG } } });
  await prisma.$disconnect();
  await new Promise<void>((r) => server.close(() => r()));
});

const get = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = (await res.json()) as any[];
  return { res, body, mine: body.filter((e) => String(e.title).startsWith(TAG)) };
};

describe('GET /api/public/gallery', () => {
  it('sem login; destaque primeiro, depois data decrescente', async () => {
    const { res, mine, body } = await get('/api/public/gallery');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(mine.map((e) => e.title.split(' ').pop())).toEqual(['feat', 'new', 'old']);
    expect(body[0].featured).toBe(true);
    expect(mine[0].dateISO).toBe('1999-03-05');
  });

  it('só os campos que o site usa (sem id, vínculos nem campos internos)', async () => {
    const { mine } = await get('/api/public/gallery');
    for (const e of mine) {
      expect(Object.keys(e).sort()).toEqual(['date', 'dateISO', 'description', 'featured', 'images', 'title']);
      expect(e.images).toEqual([{ src: 'assets/images/a.jpg', alt: 'A' }]);
    }
  });

  it('CORS aberto sem credenciais', async () => {
    const { res } = await get('/api/public/gallery', { Origin: 'https://qualquer.exemplo' });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });
});

describe('GET /api/public/destinations', () => {
  it('só revisados e com coordenadas, no formato do mapa', async () => {
    const { res, mine } = await get('/api/public/destinations');
    expect(res.status).toBe(200);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toEqual({ title: `${TAG} ok`, place: 'Lucena - PB', date: '18 de outubro de 2026', lat: -6.5, lng: -34.5 });
  });

  it('revisar faz aparecer; voltar para revisão faz sumir; sem campo interno', async () => {
    await prisma.visit.update({ where: { id: ids.pending }, data: { needsReview: false } });
    let { mine } = await get('/api/public/destinations');
    expect(mine.map((d) => d.title)).toContain(`${TAG} pending`);
    for (const d of mine) expect(Object.keys(d).sort()).toEqual(expect.arrayContaining(['lat', 'lng', 'place', 'title']));
    expect(JSON.stringify(mine)).not.toMatch(/storedIdentity|needsReview|notes|"id"|tripId/);
    await prisma.visit.update({ where: { id: ids.pending }, data: { needsReview: true } });
    ({ mine } = await get('/api/public/destinations'));
    expect(mine.map((d) => d.title)).not.toContain(`${TAG} pending`);
  });

  it('CORS aberto e POST não existe', async () => {
    const { res } = await get('/api/public/destinations', { Origin: 'https://x.exemplo' });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect((await fetch(`${baseUrl}/api/public/destinations`, { method: 'POST' })).status).toBe(404);
  });
});

describe('revisão de destinos', () => {
  it('desligar da viagem NÃO devolve um destino revisado para a fila', async () => {
    const trip = await prisma.trip.create({
      data: { title: `${TAG} t`, category: 'c', description: 'd', city: 'c', region: 'PB', intensityClass: 'leve', includes: '[]', media: '[]', startDateISO: new Date('2030-01-01'), storedIdentity: `${TAG}:t` },
    });
    try {
      await visitService.associateWithTrip(ids.ok, trip.id);
      await visitService.associateWithTrip(ids.ok, null);
      expect((await prisma.visit.findUnique({ where: { id: ids.ok } }))!.needsReview).toBe(false);
      // ligar marca como revisado
      await visitService.associateWithTrip(ids.pending, trip.id);
      expect((await prisma.visit.findUnique({ where: { id: ids.pending } }))!.needsReview).toBe(false);
    } finally {
      await prisma.visit.updateMany({ where: { tripId: trip.id }, data: { tripId: null } });
      await prisma.trip.delete({ where: { id: trip.id } });
    }
  });

  it('a contagem do Início (needsReview true) acompanha a revisão', async () => {
    const count = () => prisma.visit.count({ where: { needsReview: true, storedIdentity: { startsWith: TAG } } });
    await prisma.visit.update({ where: { id: ids.ok }, data: { needsReview: true } });
    const before = await count();
    await visitService.update(ids.ok, { needsReview: false });
    expect(await count()).toBe(before - 1);
    await visitService.update(ids.ok, { needsReview: true });
    expect(await count()).toBe(before);
  });
});

const entry = (title: string, dateISO: string, featured?: boolean) => ({ title, date: dateISO, dateISO, description: '', images: [], ...(featured === undefined ? {} : { featured }) });
const jsonFetch = (payload: unknown, ok = true) => async () => ({ ok, status: ok ? 200 : 500, statusText: '', json: async () => payload }) as any;

describe('js/publicData.js (site)', () => {
  it('orderGallery: destaque primeiro, demais por data decrescente; sem destaque, só por data', () => {
    const list = [entry('a', '2026-01-01'), entry('b', '2026-09-01'), entry('c', '2025-01-01', true)];
    expect(orderGallery(list).map((e) => e.title)).toEqual(['c', 'b', 'a']);
    expect(orderGallery(list.slice(0, 2)).map((e) => e.title)).toEqual(['b', 'a']);
  });

  it('resolveGallery usa a API; array vazio é válido', async () => {
    const warn = () => { throw new Error('não deveria avisar'); };
    expect((await resolveGallery(jsonFetch([entry('x', '2026-01-01')]), [entry('fixa', '2020-01-01')], { warn })).map((e) => e.title)).toEqual(['x']);
    expect(await resolveGallery(jsonFetch([]), [entry('fixa', '2020-01-01')], { warn })).toEqual([]);
  });

  it('resolveGallery cai para a lista fixa com console.warn (erro, HTTP ruim, não-array)', async () => {
    const fixed = [entry('f1', '2020-01-01'), entry('f2', '2021-01-01')];
    for (const f of [async () => { throw new Error('rede'); }, jsonFetch({}, false), jsonFetch({ nao: 'array' })]) {
      const warns: string[] = [];
      const out = await resolveGallery(f as any, fixed, { warn: (m: string) => warns.push(m) });
      expect(out.map((e) => e.title)).toEqual(['f2', 'f1']);
      expect(warns).toHaveLength(1);
    }
  });

  it('fetchPublicArray respeita o tempo limite', async () => {
    const hang = (_u: string, o: any) => new Promise((_r, rej) => o.signal.addEventListener('abort', () => rej(new Error('abortado'))));
    const warns: string[] = [];
    const t0 = Date.now();
    expect(await fetchPublicArray(hang as any, '/x', { timeoutMs: 50, warn: (m: string) => warns.push(m) })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(warns).toHaveLength(1);
  });

  const place = (title: string, lat: number, lng: number, date?: string) => ({ title, place: 'X - PB', lat, lng, ...(date ? { date } : {}) });

  it('mergeDestinations: lista fixa + API; API prevalece na mesma coordenada; nada some', () => {
    const fixed = [place('Fixo A', -7.1, -35.1, 'd1'), place('Fixo A', -7.1004, -35.1004, 'd2'), place('Fixo B', -8, -36)];
    const api = [place('API A', -7.1001, -35.1001, 'd3'), place('API C', -9, -37)];
    const out = mergeDestinations(fixed, api);
    expect(out.map((d) => d.title)).toEqual(['API A', 'Fixo B', 'API C']);
    expect(out[0].visits).toHaveLength(1);
  });

  it('mergeDestinations: sem API (null) mantém a lista fixa agrupada por coordenada', () => {
    const fixed = [place('A', -7.1, -35.1, 'd1'), place('A', -7.1004, -35.1004, 'd2'), place('B', -8, -36)];
    const out = mergeDestinations(fixed, null as any);
    expect(out).toHaveLength(2);
    expect(out[0].visits.map((v: any) => v.date)).toEqual(['d1', 'd2']);
  });
});
