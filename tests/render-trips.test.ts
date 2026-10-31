import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error módulo JS do site
import { formatTripTime, buildTripSchema, normalizeTrip, buildTripCardHTML, buildHeroTripHTML, buildTripCardsHTML } from '../js/render.js';
// @ts-expect-error módulo JS do site
import { setupWaLinks } from '../js/whatsapp.js';

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

describe('viagem esgotada ou encerrada (T17)', () => {
  const withStatus = (status: string) => ({ ...full, status });
  const cases: Array<[string, string]> = [['sold_out', 'Esgotado'], ['closed', 'Inscrições encerradas']];

  it.each(cases)('card %s: aviso, sem Pix e botão trocado', (status, notice) => {
    const html = buildTripCardHTML({ ...withStatus(status), buttonLabel: 'Quero viajar' }, 0);
    expect(html).toContain(`>${notice}</p>`);
    expect(html).not.toContain('pix-trigger');
    expect(html).not.toContain('Pagar Pix');
    expect(html).toContain('Avise-me da próxima');
    expect(html).not.toContain('Quero viajar');
    expect(html).toContain('data-wa-kind="avisar"');
  });

  it('o aviso aparece também em viagem sem foto', () => {
    expect(buildTripCardHTML({ ...bare, status: 'sold_out' }, 0)).toContain('Esgotado');
  });

  it.each(cases)('JSON-LD %s vira SoldOut', (status) => {
    const schema = buildTripSchema({ ...withStatus(status), availabilitySchema: 'https://schema.org/InStock' });
    expect(schema.offers.availability).toBe('https://schema.org/SoldOut');
  });

  it.each(cases)('hero %s: mesmo aviso e botão, sem vagas restantes', (status, notice) => {
    const html = buildHeroTripHTML({ ...withStatus(status), spotsLeft: 5 });
    expect(html).toContain(`>${notice}</p>`);
    expect(html).toContain('Avise-me da próxima');
    expect(html).not.toContain('Restam');
  });

  it.each(cases)('mensagem do WhatsApp (%s) cita a viagem e o aviso', (status, notice) => {
    const link: any = {
      dataset: { waTrip: 'Trip X', waKind: 'avisar', waNotice: notice },
      textContent: 'Avise-me da próxima',
      href: '',
      setAttribute() {},
      addEventListener() {},
    };
    vi.stubGlobal('document', { querySelectorAll: () => [link] });
    setupWaLinks();
    vi.unstubAllGlobals();
    const msg = decodeURIComponent(link.href.split('text=')[1]);
    expect(msg).toContain('Trip X');
    expect(msg).toContain(status === 'sold_out' ? 'esgotada' : 'encerradas');
    expect(msg).toContain('próxima viagem');
    expect(msg).not.toContain('valor de');
  });

  it('viagem aberta mantém card, hero e JSON-LD sem aviso', () => {
    const open = { ...full, status: 'open', spotsLeft: 5 };
    const card = buildTripCardHTML(open, 0);
    expect(card).not.toContain('trip-closed-notice');
    expect(card).toContain('pix-trigger');
    expect(card).toContain('Pagar Pix');
    expect(card).toContain(full.buttonLabel);
    expect(card).not.toContain('Avise-me');
    expect(card).not.toContain('Esgotado');
    expect(card).not.toContain('Inscrições encerradas');
    expect(buildHeroTripHTML(open)).not.toContain('trip-closed-notice');
    expect(buildTripSchema(open).offers.availability).toBe(full.availabilitySchema);
  });
});
