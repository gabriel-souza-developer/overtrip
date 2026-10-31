import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error módulo JS do site
import { formatTripTime, normalizeTrip, buildTripCardHTML, buildHeroTripHTML, buildTripCardsHTML } from '../js/render.js';

const full = JSON.parse(readFileSync(resolve(__dirname, '../trips.json'), 'utf-8'))[0];

// Viagem como a API devolve quando o painel deixa tudo opcional em branco.
const bare = {
  title: 'Sem fotos',
  headlineDisplay: null,
  category: null,
  description: 'Teste',
  city: 'Cidade',
  region: 'PB',
  meetingCity: null,
  meetingPoint: null,
  meetingInfo: null,
  departures: null,
  startDateISO: '2030-05-10T09:00:00-03:00',
  priceDisplay: null,
  priceUnit: null,
  free: false,
  intensityLabel: '',
  includes: null,
  includesHighlight: null,
  media: [],
  buttonLabel: null,
  buttonClass: null,
  status: 'open',
};

describe('viagem sem fotos e com campos nulos', () => {
  it('o card sai sem <img> e com fundo simples', () => {
    const html = buildTripCardHTML(bare, 0);
    expect(html).toContain('trip-media--empty');
    expect(html).toContain('var(--moss)');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/null|undefined/);
  });

  it('o hero da próxima viagem não quebra', () => {
    const html = buildHeroTripHTML(bare);
    expect(html).not.toMatch(/null|undefined/);
  });

  it('normalizeTrip troca null por texto/lista vazios', () => {
    const t = normalizeTrip(bare);
    expect(t.media).toEqual([]);
    expect(t.includes).toEqual([]);
    expect(t.departures).toEqual([]);
    expect(t.category).toBe('');
  });

  it('ignora itens de mídia sem src', () => {
    expect(normalizeTrip({ ...bare, media: [{ alt: 'x' }, null, { src: 'a.jpg', alt: 'a' }] }).media).toHaveLength(1);
  });
});

describe('viagem com foto mantém o HTML', () => {
  it('card completo tem <img> e não usa o fundo de reserva', () => {
    const html = buildTripCardHTML(full, 3);
    expect(html).toContain('<img src="' + full.media[0].src + '"');
    expect(html).not.toContain('trip-media--empty');
    expect(html).toContain(full.includesHighlight);
  });
});

describe('isolamento por card', () => {
  it('uma viagem ruim é pulada com aviso e as outras continuam', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { ...full, startDateISO: 'data-invalida' };
    const html = buildTripCardsHTML([
      { trip: full, index: 0 },
      { trip: broken, index: 1 },
      { trip: bare, index: 2 },
    ]);
    expect(html.match(/<article/g)).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('horário de viagem', () => {
  // Texto visível do card, sem tags (os SVGs têm coordenadas como "M3 10h18").
  const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const TIME = /\d{2}h\d{2}/;

  it('data sem hora não gera horário', () => {
    expect(formatTripTime('2026-11-29')).toBe('');
    const dateOnly = { ...bare, startDateISO: '2026-11-29', departureTime: null, scheduleInfo: null, returnTime: null };
    expect(visibleText(buildTripCardHTML(dateOnly, 0))).not.toMatch(TIME);
    expect(visibleText(buildHeroTripHTML(dateOnly))).not.toMatch(TIME);
  });
  it('a mesma viagem com departureTime mostra o horário', () => {
    const withTime = { ...bare, startDateISO: '2026-11-29', departureTime: '05h30', scheduleInfo: null, returnTime: null };
    expect(visibleText(buildTripCardHTML(withTime, 0))).toContain('05h30');
  });
  it('data com hora continua igual', () => {
    expect(formatTripTime('2026-09-13T03:30:00-03:00')).toBe('03h30');
  });
});
