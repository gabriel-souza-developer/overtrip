import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { countAdvancedFilled } from '../frontend/src/lib/panelHelpers';

const form = readFileSync('frontend/src/pages/TripForm.tsx', 'utf8');
const layout = readFileSync('frontend/src/components/Layout.tsx', 'utf8');
const dashboard = readFileSync('frontend/src/pages/Dashboard.tsx', 'utf8');

const empty = {
  headlineDisplay: '', priceDisplay: '', priceUnit: 'por pessoa', departureTolerance: '',
  buttonLabel: 'Quero viajar', buttonClass: 'button-dark', scheduleInfo: '', scheduleTBD: false,
  trailDistance: '', supportPoint: '', supportPointInfo: '', includesHighlight: '',
  includedServices: [] as string[], meetingDetails: '', meetingMapsQuery: '', departures: [] as unknown[],
};

describe('TripForm: seções', () => {
  const titles = [...form.matchAll(/<FormSection title="([^"]+)"/g)].map((m) => m[1]);

  it('tem 3 seções visíveis e uma única seção recolhida de ajustes', () => {
    expect(titles).toEqual(['Sobre a viagem', 'Embarque e horários', 'Roteiro e avisos', 'Ajustes do site (raramente necessário)']);
    expect(form).not.toMatch(/FormSection[^>]*defaultOpen/);
  });

  it.each([
    ['Sobre a viagem', ['id="description"', 'id="category"', 'id="intensityClass"', 'id="spotsLeft"', 'id="includes-input"']],
    ['Embarque e horários', ['id="meetingCity"', 'id="meetingPoint"', 'id="departureTime"', 'id="endDateISO"', 'id="returnTime"']],
    ['Ajustes do site', ['id="headlineDisplay"', 'id="priceDisplay"', 'id="priceUnit"', 'id="buttonLabel"', 'id="departureTolerance"', 'id="meetingMapsQuery"', 'id="supportPoint"', 'DeparturesInput']],
  ])('seção %s contém os campos esperados', (title, fields) => {
    const start = form.indexOf(`<FormSection title="${title}`);
    const end = form.indexOf('</FormSection>', start);
    const block = form.slice(start, end);
    for (const f of fields) expect(block).toContain(f);
  });

  it('todos os campos que existiam continuam no formulário (nenhum valor some)', () => {
    for (const name of ['headlineDisplay', 'trailDistance', 'supportPoint', 'supportPointInfo', 'includesHighlight', 'includedServices', 'meetingDetails', 'scheduleInfo', 'scheduleTBD', 'status']) {
      expect(form).toMatch(new RegExp(`(name|id)="${name}|'${name}'|${name}-input`));
    }
  });
});

describe('countAdvancedFilled', () => {
  it('valores padrão não contam', () => {
    expect(countAdvancedFilled(empty)).toBe(0);
  });
  it('conta o que está preenchido e o que mudou do padrão', () => {
    expect(countAdvancedFilled({ ...empty, priceDisplay: 'R$ 10', buttonLabel: 'Reservar', departures: [{}], scheduleTBD: true })).toBe(4);
    expect(countAdvancedFilled({ ...empty, buttonLabel: 'Quero viajar', priceUnit: 'por casal' })).toBe(1);
  });
});

describe('nomes do painel', () => {
  it('menu e início usam os nomes novos', () => {
    expect(layout).toContain("label: 'Próxima trip'");
    expect(layout).toContain("label: 'Destinos visitados'");
    expect(layout).toContain("label: 'Galeria de memórias'");
    expect(layout).not.toMatch(/label: '(Viagens|Visitas|Galeria)'/);
    expect(dashboard).toContain("label: 'Próxima trip'");
    expect(dashboard).toContain("label: 'Destinos visitados'");
    expect(dashboard).not.toMatch(/label: '(Viagens|Visitas)'/);
  });
  it('as URLs não mudam', () => {
    for (const path of ["'/trips'", "'/visits'", "'/gallery'"]) expect(layout).toContain(path);
  });
});
