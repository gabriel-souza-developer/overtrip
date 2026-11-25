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
  it('organiza os campos em seis blocos, do atalho de preenchimento até a publicação, nessa ordem', () => {
    const headings = [
      'Preencher automaticamente', 'Informações principais', 'Embarque e horários',
      'Como é a experiência', 'Roteiro e orientações', 'Publicação',
    ].map(heading => form.indexOf(`>${heading}</h2>`));
    expect(headings.every(index => index >= 0)).toBe(true);
    expect(headings).toEqual([...headings].sort((a, b) => a - b));
    expect(form).not.toContain('Detalhes opcionais');
    expect(form).not.toContain('Outros detalhes da viagem');
    expect(form).not.toContain('Dados da viagem');
    expect(form).not.toContain('Configurações adicionais do painel');
  });

  it.each([
    ['Preencher automaticamente', ['Usar como modelo', 'Sugerir preenchimento com PDF e IA', 'AiDraftBlock']],
    ['Informações principais', ['id="title"', 'id="region"', 'id="city"', 'id="startDateISO"', 'id="endDateISO"', 'id="priceValue"', 'id="free"', 'id="spotsLeft"', 'id="filterCategory"', 'id="headlineDisplay"', 'id="priceDisplay"']],
    ['Embarque e horários', ['id="departureTime"', 'id="returnTime"', 'id="scheduleTBD"', 'id="meetingCity"', 'id="meetingPoint"', 'id="meetingTBD"', 'DeparturesInput', 'id="meetingDetails"', 'id="departureTolerance"', 'id="scheduleInfo"', 'id="meetingMapsQuery"']],
    ['Como é a experiência', ['id="description"', 'MediaInput', 'id="category"', 'id="intensityClass"', 'id="includes-custom-input"', 'id="includesHighlight"']],
    ['Roteiro e orientações', ['id="itinerary-input"', 'id="important-info-input"', 'id="trailDistance"', 'id="supportPoint"', 'id="supportPointInfo"', 'id="route-notes-input"']],
    ['Publicação', ['PublicationReadinessPanel', 'id="status"']],
  ])('bloco "%s" contém seus campos', (heading, fields) => {
    const start = form.indexOf(`>${heading}</h2>`);
    const end = form.indexOf('</fieldset>', start);
    const block = form.slice(start, end);
    for (const field of fields as string[]) expect(block).toContain(field);
  });

  it('esconde os campos raros atrás de um "Mais opções" por bloco, que abre quando já há dado preenchido', () => {
    expect(form.match(/Mais opções/g)?.length).toBe(3);
    expect(form).toContain('open={essentialMoreOpen}');
    expect(form).toContain('open={departureMoreOpen}');
    expect(form).toContain('open={experienceMoreOpen}');
  });

  it('o painel de publicação recebe onFieldFocus para focar o campo pendente de cada item', () => {
    expect(form).toContain('onFieldFocus={focusPublicationField}');
    expect(form).toContain('const focusPublicationField');
    expect(form).toContain('problems={publicationIssues}');
  });

  it('mostra a prévia mobile depois do bloco de publicação e mantém o uso de modelo discreto', () => {
    expect(form.indexOf('Ver prévia da viagem')).toBeGreaterThan(form.indexOf('>Publicação</h2>'));
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
    expect(dashboard).toContain("label: 'Próximas viagens'");
    expect(dashboard).toContain("detail: 'De hoje em diante'");
    expect(dashboard).not.toContain('Seu resumo');
    expect(dashboard).toContain("label: 'Destinos para revisar'");
    expect(dashboard).not.toMatch(/label: '(Viagens|Visitas)'/);
  });
  it('as URLs não mudam', () => {
    for (const path of ["'/trips'", "'/visits'", "'/gallery'"]) expect(layout).toContain(path);
  });
});
