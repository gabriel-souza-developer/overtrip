import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo JS do site
import { buildTripCardHTML, buildTripMapHTML, getTripMapPoints, validMapCoord } from '../js/render.js';

const full = JSON.parse(readFileSync(resolve(__dirname, '../trips.json'), 'utf-8'))[0];
const base = { ...full, meetingTBD: false, meetingLat: null, meetingLng: null, departures: [] };

describe('validMapCoord', () => {
  it('aceita só números finitos dentro do intervalo de lat/lng', () => {
    expect(validMapCoord(-7.21, -35.88)).toEqual({ lat: -7.21, lng: -35.88 });
    expect(validMapCoord(null, -35.88)).toBeNull();
    expect(validMapCoord(undefined, undefined)).toBeNull();
    expect(validMapCoord(91, 0)).toBeNull();
    expect(validMapCoord(0, 181)).toBeNull();
    expect(validMapCoord(NaN, 0)).toBeNull();
    expect(validMapCoord(Infinity, 0)).toBeNull();
  });
});

describe('getTripMapPoints', () => {
  it('viagem antiga sem coordenadas não gera nenhum ponto', () => {
    expect(getTripMapPoints(base)).toEqual([]);
  });

  it('usa a coordenada do ponto único de embarque quando confirmada', () => {
    const trip = { ...base, meetingLat: -7.2159, meetingLng: -35.8814, meetingCity: 'Campina Grande', meetingPoint: 'Praça da Bandeira' };
    const points = getTripMapPoints(trip);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ lat: -7.2159, lng: -35.8814 });
  });

  it('ignora a coordenada do embarque quando ainda é a confirmar (meetingTBD)', () => {
    const trip = { ...base, meetingTBD: true, meetingLat: -7.2159, meetingLng: -35.8814 };
    expect(getTripMapPoints(trip)).toEqual([]);
  });

  it('inclui cada ponto de embarque com coordenada confirmada, ignorando os sem coordenada', () => {
    const trip = {
      ...base,
      departures: [
        { time: '06h00', place: 'Praça', city: 'Campina Grande', lat: -7.21, lng: -35.88, orderIndex: 0 },
        { time: '06h30', place: 'Shopping', city: 'Pocinhos', orderIndex: 1 },
      ],
    };
    const points = getTripMapPoints(trip);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ lat: -7.21, lng: -35.88 });
  });

  it('não acrescenta o embarque principal antigo quando existe uma lista detalhada', () => {
    const trip = {
      ...base,
      meetingLat: -7.5,
      meetingLng: -35.5,
      departures: [{ time: '06h00', place: 'Praça', city: 'Campina Grande', orderIndex: 0 }],
    };
    expect(getTripMapPoints(trip)).toEqual([]);
  });
});

describe('buildTripMapHTML', () => {
  it('não gera nada quando não há pontos confirmados', () => {
    expect(buildTripMapHTML(base, 0, [])).toBe('');
  });

  it('inclui o container do mapa, atribuição ao OpenStreetMap e link de apoio em texto', () => {
    const points = [{ lat: -7.21, lng: -35.88, label: 'Praça da Bandeira' }];
    const html = buildTripMapHTML(base, 0, points);
    expect(html).toContain('trip-boarding-map');
    expect(html).toContain('id="trip-map-0"');
    expect(html).toContain('OpenStreetMap');
    expect(html).toContain('openstreetmap.org/?mlat=-7.21');
    expect(html).toContain('role="group"');
  });

  it('escapa rótulos inseguros tanto no JSON embutido quanto no link de apoio', () => {
    const attack = '"><img src=x onerror=alert(1)>';
    const points = [{ lat: -7.21, lng: -35.88, label: attack }];
    const html = buildTripMapHTML({ ...base, title: attack }, 0, points);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('mapa no card da viagem (buildTripCardHTML)', () => {
  it('mostra todos os pontos e horários adicionados à lista, inclusive o principal copiado', () => {
    const trip = {
      ...base, meetingCity: 'Campina Grande', meetingPoint: 'Rodoviária Nova',
      departures: [
        { time: '05h', city: 'Campina Grande', place: 'Rodoviária Nova', orderIndex: 0 },
        { time: '06h', city: 'Pocinhos', place: 'Igreja Matriz', orderIndex: 1 },
      ],
    };
    const html = buildTripCardHTML(trip, 0);
    for (const value of ['Rodoviária Nova', 'Campina Grande', '05h', 'Igreja Matriz', 'Pocinhos', '06h']) expect(html).toContain(value);
    expect(html).toContain('Embarque em 2 pontos');
  });

  it('viagem antiga sem coordenadas não inclui o container do mapa', () => {
    expect(buildTripCardHTML(base, 0)).not.toContain('trip-boarding-map');
  });

  it('viagem com coordenada confirmada inclui o container do mapa', () => {
    const trip = { ...base, meetingLat: -7.2159, meetingLng: -35.8814 };
    expect(buildTripCardHTML(trip, 0)).toContain('trip-boarding-map');
  });
});
