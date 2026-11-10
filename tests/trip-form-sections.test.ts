import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { countAdvancedFilled } from '../frontend/src/lib/panelHelpers';

const form = readFileSync('frontend/src/pages/TripForm.tsx', 'utf8');
const layout = readFileSync('frontend/src/components/Layout.tsx', 'utf8');
const dashboard = readFileSync('frontend/src/pages/Dashboard.tsx', 'utf8');

const empty = {
  headlineDisplay: '', priceDisplay: '', departureTolerance: '',
  scheduleInfo: '', scheduleTBD: false,
  trailDistance: '', supportPoint: '', supportPointInfo: '', includesHighlight: '',
  includedServices: [] as string[], meetingDetails: '', meetingMapsQuery: '', departures: [] as unknown[],
};

describe('TripForm: seções', () => {
  const titles = [...form.matchAll(/<FormSection title="([^"]+)"/g)].map((m) => m[1]);

  it('apresenta dados principais e uma seção de detalhes opcionais', () => {
    expect(titles).toEqual(['Detalhes opcionais']);
    expect(form).toContain('Dados da viagem');
    expect(form).toContain('Outros detalhes da viagem');
  });

  it.each([
    ['Dados da viagem', '<fieldset className="card p-5 space-y-5">', '</fieldset>', ['id="description"', 'id="priceValue"', 'MediaInput', 'id="meetingCity"', 'id="meetingPoint"', 'id="meetingTBD"', 'PublicationReadinessPanel', 'DeparturesInput']],
    ['Detalhes opcionais', '<FormSection title="Detalhes opcionais"', '</FormSection>', ['id="category"', 'id="intensityClass"', 'id="spotsLeft"', 'id="departureTime"', 'id="endDateISO"', 'id="returnTime"', 'id="includes-custom-input"', 'id="itinerary-input"', 'id="headlineDisplay"', 'id="priceDisplay"', 'id="departureTolerance"', 'id="meetingMapsQuery"', 'id="supportPoint"']],
  ])('seção %s contém os campos esperados', (_title, opening, closing, fields) => {
    const start = form.indexOf(opening as string);
    const end = form.indexOf(closing as string, start);
    const block = form.slice(start, end);
    for (const f of fields as string[]) expect(block).toContain(f);
  });

  it('todos os campos que existiam continuam no formulário (nenhum valor some)', () => {
    for (const name of ['headlineDisplay', 'trailDistance', 'supportPoint', 'supportPointInfo', 'includesHighlight', 'meetingDetails', 'scheduleInfo', 'scheduleTBD', 'status']) {
      expect(form).toMatch(new RegExp(`(name|id)="${name}|'${name}'|${name}-input`));
    }
  });

  it('usa um campo de data e um de horário por saída e retorno', () => {
    expect(form).toContain('type="date"');
    expect(form).toContain('type="time"');
    expect(form).not.toContain('type="datetime-local"');
    expect(form.match(/<input id="departureTime"/g)).toHaveLength(1);
  });

  it('migra serviços antigos para a lista única do formulário', () => {
    expect(form).toContain('mergeUnique(trip.includes, trip.includedServices || [])');
    expect(form).toContain('includedServices: []');
  });
});

describe('countAdvancedFilled', () => {
  it('valores padrão não contam', () => {
    expect(countAdvancedFilled(empty)).toBe(0);
  });
  it('conta o que está preenchido', () => {
    expect(countAdvancedFilled({ ...empty, priceDisplay: 'R$ 10', departures: [{}], scheduleTBD: true })).toBe(3);
  });
});

describe('nomes do painel', () => {
  it('menu e início usam os nomes novos', () => {
    // "Viagens" lista próximas e anteriores; "Próxima trip" chamava de próxima o que já aconteceu.
    expect(layout).toContain("label: 'Viagens'");
    expect(layout).not.toContain("label: 'Próxima trip'");
    expect(layout).toContain("label: 'Destinos visitados'");
    expect(layout).toContain("label: 'Galeria de memórias'");
    expect(layout).not.toMatch(/label: '(Visitas|Galeria)'/);
    expect(dashboard).toContain("label: 'Viagens cadastradas'");
    expect(dashboard).toContain("label: 'Destinos para revisar'");
    expect(dashboard).not.toMatch(/label: '(Viagens|Visitas)'/);
  });
  it('as URLs não mudam', () => {
    for (const path of ["'/trips'", "'/visits'", "'/gallery'"]) expect(layout).toContain(path);
  });
});
