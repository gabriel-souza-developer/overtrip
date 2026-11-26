import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIMATE_SOURCES, SEASON_DISCLAIMER, TOURISM_SOURCES, carnivalTuesday, mapsSearchUrl, seasonalGuide } from '../frontend/src/lib/paraibaSeason';

describe('orientação sazonal da Paraíba', () => {
  it('cobre os 12 meses com as três regiões e ao menos duas atividades', () => {
    for (let month = 0; month < 12; month++) {
      const guide = seasonalGuide(2027, month)!;
      expect(Object.keys(guide.regions).sort()).toEqual(['agreste', 'litoral', 'sertao']);
      expect(guide.activities.length).toBeGreaterThanOrEqual(2);
      for (const activity of guide.activities) expect(activity.mapsQuery).toMatch(/\S/);
    }
    expect(seasonalGuide(2027, 12)).toBeNull();
  });

  it('segue os regimes das fontes: litoral chove no inverno, Sertão no início do ano', () => {
    expect(seasonalGuide(2027, 5)!.regions.litoral.rain).toBe('alta');
    expect(seasonalGuide(2027, 10)!.regions.litoral.rain).toBe('baixa');
    expect(seasonalGuide(2027, 2)!.regions.sertao.rain).toBe('alta');
    expect(seasonalGuide(2027, 6)!.regions.sertao.rain).toBe('baixa');
  });

  it('calcula o Carnaval pelo ano escolhido e o mostra só no mês certo', () => {
    expect(carnivalTuesday(2026)).toBe('2026-02-17');
    expect(carnivalTuesday(2027)).toBe('2027-02-09');
    expect(carnivalTuesday(2025)).toBe('2025-03-04');
    expect(seasonalGuide(2027, 1)!.events[0]).toContain('09/02/2027');
    expect(seasonalGuide(2025, 2)!.events.some((event) => event.includes('04/03/2025'))).toBe(true);
    expect(seasonalGuide(2025, 1)!.events.some((event) => event.startsWith('Carnaval'))).toBe(false);
  });

  it('deixa explícito que é climatologia, não previsão, e cita fontes https', () => {
    expect(SEASON_DISCLAIMER).toMatch(/não é previsão/i);
    expect(CLIMATE_SOURCES.map((source) => source.url).join(' ')).toMatch(/inmet\.gov\.br.*aesa\.pb\.gov\.br/s);
    for (const source of [...CLIMATE_SOURCES, ...TOURISM_SOURCES]) expect(source.url).toMatch(/^https:\/\//);
    expect(mapsSearchUrl('Pedra do Ingá')).toBe('https://www.google.com/maps/search/?api=1&query=Pedra%20do%20Ing%C3%A1');
    const component = readFileSync('frontend/src/components/SeasonalGuide.tsx', 'utf8');
    expect(component).toContain('Orientação climatológica, não é previsão');
    expect(component).toContain('rel="noopener noreferrer"');
  });

  it('o Início liga a orientação ao mês do calendário', () => {
    const dashboard = readFileSync('frontend/src/pages/Dashboard.tsx', 'utf8');
    expect(dashboard).toContain('<TripCalendar month={calendarMonth} onMonthChange={setCalendarMonth} />');
    expect(dashboard).toContain('<SeasonalGuide month={calendarMonth} />');
  });
});
