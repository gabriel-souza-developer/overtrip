import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLIMATE_SOURCES, FEEDBACK_DISCLAIMER, FORECAST_SOURCES, SEASON_DISCLAIMER, VISITOR_FEEDBACK, ZONES, mapsSearchUrl, rainPhase, seasonalGuide,
} from '../frontend/src/lib/paraibaSeason';

const source = readFileSync('frontend/src/lib/paraibaSeason.ts', 'utf8');
const component = readFileSync('frontend/src/components/SeasonalGuide.tsx', 'utf8');

describe('orientação sazonal da Paraíba (climatologia AESA)', () => {
  it('usa as três zonas da AESA com seus períodos chuvosos', () => {
    expect(ZONES.leste).toMatchObject({ name: 'Litoral, Brejo e Agreste', window: [3, 6] }); // abr–jul
    expect(ZONES.semiarido).toMatchObject({ name: 'Cariri, Curimataú e Sertão', window: [1, 4] }); // fev–mai
    expect(ZONES.altoSertao).toMatchObject({ name: 'Alto Sertão', window: [0, 3] }); // jan–abr
    // Pocinhos é Cariri na AESA, não Agreste.
    expect(ZONES.semiarido.places).toContain('Pocinhos');
    expect(ZONES.leste.places).not.toContain('Pocinhos');
  });

  it('marca início, fim e transições sem dizer que março é início no Litoral/Agreste', () => {
    expect(rainPhase('leste', 2)).toBe('antes');
    expect(rainPhase('leste', 3)).toBe('inicio');
    expect(rainPhase('leste', 6)).toBe('fim');
    expect(rainPhase('leste', 7)).toBe('depois');
    expect(rainPhase('leste', 10)).toBe('seco');
    expect(rainPhase('altoSertao', 0)).toBe('inicio');
    expect(rainPhase('altoSertao', 3)).toBe('fim');
    expect(rainPhase('altoSertao', 11)).toBe('antes');
    expect(rainPhase('semiarido', 4)).toBe('fim');
    expect(rainPhase('semiarido', 5)).toBe('depois');
  });

  it('cobre os 12 meses com resumo e no máximo três recomendações, sem eventos datados', () => {
    for (let month = 0; month < 12; month++) {
      const guide = seasonalGuide(month)!;
      expect(guide.zones).toHaveLength(3);
      expect(guide.summary).toMatch(/\S/);
      expect(guide.activities.length).toBeGreaterThanOrEqual(2);
      expect(guide.activities.length).toBeLessThanOrEqual(3);
    }
    expect(seasonalGuide(12)).toBeNull();
    expect(seasonalGuide(10)!.summary).toContain('Nenhuma região');
    expect(seasonalGuide(3)!.summary).toContain('Todas as regiões');
    expect(seasonalGuide(6)!.summary).toBe('Período chuvoso típico em Litoral, Brejo e Agreste; as demais regiões estão em transição ou fora dele.');
    expect(source).not.toMatch(/carnival|Carnaval|events/);
  });

  it('não cita milímetros nem notas de avaliação', () => {
    expect(source).not.toMatch(/\d+(,\d+)?\s*mm\b/);
    expect(source).not.toMatch(/\b[0-5][.,]\d\s*(estrelas|\/\s*5)\b/);
    for (const item of VISITOR_FEEDBACK) for (const theme of item.themes) expect(theme).not.toMatch(/\d[.,]\d/);
  });

  it('cita fontes diretas (AESA, Atlas, previsão e avisos) e deixa claro que não é previsão', () => {
    const urls = [...CLIMATE_SOURCES, ...FORECAST_SOURCES].map((item) => item.url);
    expect(urls).toContain('https://www.aesa.pb.gov.br/biblioteca/atlas-pluviometrico-da-paraiba/');
    expect(urls).toContain('https://www.aesa.pb.gov.br/previsao-do-tempo/');
    expect(urls).toContain('https://avisos.inmet.gov.br');
    for (const url of [...urls, ...VISITOR_FEEDBACK.map((item) => item.url)]) expect(url).toMatch(/^https:\/\//);
    expect(SEASON_DISCLAIMER).toMatch(/Não é previsão do tempo/);
    expect(FEEDBACK_DISCLAIMER).toMatch(/subjetivas/);
    expect(mapsSearchUrl('Pedra do Ingá')).toBe('https://www.google.com/maps/search/?api=1&query=Pedra%20do%20Ing%C3%A1');
  });

  it('a tela mostra resumo e recomendações e recolhe fontes e opiniões', () => {
    expect(component).toContain('Orientação climatológica, não é previsão');
    expect(component).toContain('<details');
    expect(component.indexOf('<details')).toBeLessThan(component.indexOf('VISITOR_FEEDBACK.map'));
    expect(component).toContain('rel="noopener noreferrer"');
  });

  it('o Início liga a orientação ao mês do calendário', () => {
    const dashboard = readFileSync('frontend/src/pages/Dashboard.tsx', 'utf8');
    expect(dashboard).toContain('<SeasonalGuide month={calendarMonth} />');
  });
});
