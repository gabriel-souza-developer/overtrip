import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTripCardHTML } from '../js/render.js';

const full = JSON.parse(readFileSync(resolve(__dirname, '../trips.json'), 'utf-8'))[0];
const base = { ...full, itinerary: null, routeNotes: null, importantInfo: null, trailDistance: null, supportPoint: null, supportPointInfo: null };

describe('informações da viagem no card do site', () => {
  it('mostra roteiro, percurso, ponto de apoio e informações importantes cadastrados no painel', () => {
    const html = buildTripCardHTML({
      ...base,
      itinerary: ['05h saída de Campina Grande', 'Trilha até o mirante'],
      trailDistance: '8 km (ida e volta)',
      supportPoint: 'Restaurante da Dona Maria',
      supportPointInfo: 'Banheiro e almoço no local',
      routeNotes: ['Trecho de areia no final'],
      importantInfo: ['Levar 2 litros de água', 'Documento original com foto'],
    }, 0);
    for (const text of ['Roteiro', '05h saída de Campina Grande', 'Trilha até o mirante', 'Percurso: 8 km (ida e volta)',
      'Ponto de apoio: Restaurante da Dona Maria', 'Banheiro e almoço no local', 'Trecho de areia no final',
      'Informações importantes', 'Levar 2 litros de água', 'Documento original com foto']) {
      expect(html, text).toContain(text);
    }
  });

  it('não cria seções vazias quando os campos não foram preenchidos', () => {
    const html = buildTripCardHTML({ ...base, includes: [] }, 0);
    for (const text of ['Roteiro', 'Informações importantes', 'Percurso:', 'Ponto de apoio:', 'O que você vai viver']) expect(html).not.toContain(text);
  });

  it('escapa o texto das novas seções', () => {
    const attack = '"><img src=x onerror=alert(1)>';
    const html = buildTripCardHTML({ ...base, itinerary: [attack], importantInfo: [attack], routeNotes: [attack], trailDistance: attack, supportPoint: attack, supportPointInfo: attack }, 0);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('ignora itens que não são texto', () => {
    const html = buildTripCardHTML({ ...base, itinerary: ['Saída', 42, null, { x: 1 }], importantInfo: 'texto solto' }, 0);
    expect(html).toContain('Saída');
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('Informações importantes');
  });
});

describe('formulário de viagem', () => {
  it('não tem mais o atalho "Reutilizar cidade e estado de um lugar visitado"', () => {
    const form = readFileSync(resolve(__dirname, '../frontend/src/pages/TripForm.tsx'), 'utf-8');
    expect(form).not.toContain('VisitPlacePicker');
    expect(readFileSync(resolve(__dirname, '../frontend/src/components/TripFormInputs.tsx'), 'utf-8')).not.toContain('visited-place-search');
  });
});
