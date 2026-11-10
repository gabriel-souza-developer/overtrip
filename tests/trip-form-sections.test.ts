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
  it('mantém os campos públicos em um único bloco de dados da viagem', () => {
    expect(form).toContain('Dados da viagem');
    expect(form).toContain('Informações para os viajantes');
    expect(form).not.toContain('Detalhes opcionais');
    expect(form).not.toContain('Outros detalhes da viagem');
  });

  it.each([
    ['dados principais e publicação', ['id="description"', 'id="priceValue"', 'MediaInput', 'id="meetingCity"', 'id="meetingPoint"', 'id="meetingTBD"', 'PublicationReadinessPanel', 'DeparturesInput']],
    ['informações públicas opcionais', ['id="filterCategory"', 'id="category"', 'id="intensityClass"', 'id="spotsLeft"', 'id="departureTime"', 'id="endDateISO"', 'id="returnTime"', 'id="priceDisplay"', 'id="includes-custom-input"', 'id="itinerary-input"', 'id="route-notes-input"', 'id="important-info-input"', 'id="scheduleInfo"', 'id="trailDistance"', 'id="supportPoint"', 'id="meetingMapsQuery"']],
  ])('%s permanecem no bloco principal', (_title, fields) => {
    const start = form.indexOf('<fieldset className="card p-5 space-y-5">');
    const end = form.indexOf('</fieldset>', start);
    const block = form.slice(start, end);
    for (const f of fields as string[]) expect(block).toContain(f);
  });

  it('mostra a prévia mobile após os dados da viagem e mantém o uso de modelo discreto', () => {
    expect(form.indexOf('Ver prévia da viagem')).toBeGreaterThan(form.indexOf('</fieldset>'));
    expect(form).toContain('Usar como modelo');
    expect(form).toContain('/trips/new?modelo=');
    expect(form).not.toContain('Criar outra viagem com estes dados');
    expect(form).not.toContain('Um cadastro para sua viagem');
  });

  it('todos os campos que existiam continuam no formulário (nenhum valor some)', () => {
    for (const name of ['headlineDisplay', 'trailDistance', 'supportPoint', 'supportPointInfo', 'includesHighlight', 'meetingDetails', 'meetingMapsQuery', 'priceDisplay', 'departureTolerance', 'scheduleInfo', 'scheduleTBD', 'status']) {
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
    expect(dashboard).toContain("label: 'Total de viagens'");
    expect(dashboard).toContain("detail: 'Inclui viagens já realizadas'");
    expect(dashboard).toContain("label: 'Destinos para revisar'");
    expect(dashboard).not.toMatch(/label: '(Viagens|Visitas)'/);
  });
  it('as URLs não mudam', () => {
    for (const path of ["'/trips'", "'/visits'", "'/gallery'"]) expect(layout).toContain(path);
  });
});
