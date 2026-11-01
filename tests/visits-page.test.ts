import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const visits = readFileSync('frontend/src/pages/Visits.tsx', 'utf8');

describe('Visits.tsx', () => {
  it('cabeçalhos usam scope="col" (atributo válido em JSX)', () => {
    expect(visits).not.toContain('scope:col');
    expect(visits.match(/<th[\s>][^>]*>/g)?.every(th => th.includes('scope="col"'))).toBe(true);
  });

  it('a coluna do mapa tem nome simples, sem jargão', () => {
    expect(visits).not.toMatch(/>Coords</);
    expect(visits).not.toContain('>Coordenadas<');
    expect(visits).toContain('>Mapa<');
  });

  it('latitude e longitude têm dica simples, sem "graus decimais"', () => {
    expect(visits).not.toContain('Graus decimais');
    expect(visits.match(/Copie do Google Maps\. Ex\.:/g)?.length).toBe(2);
  });

  it('"Marcar revisado" usa o estilo secundário, não o laranja forte', () => {
    const button = visits.slice(visits.indexOf('<Button small'), visits.indexOf('Marcar revisado'));
    expect(button).toContain('variant="secondary"');
    expect(button).not.toContain('variant="primary"');
  });

  it('os filtros de revisão e de mapa têm a opção "não"', () => {
    expect(visits).toContain('Só os já revisados');
    expect(visits).toContain('Só os sem local no mapa');
  });

  it('a janela de edição não tem mais a caixa "Ainda falta revisar" e tem os dois botões', () => {
    expect(visits).not.toContain('Ainda falta revisar');
    expect(visits).not.toContain('checkbox');
    expect(visits).toContain('Salvar e marcar como revisado');
    expect(visits).toContain('saveEdit(true)');
    expect(visits).toContain('saveEdit(false)');
  });

  it('o menu da linha tem "Voltar para revisão" só para destinos já revisados', () => {
    expect(visits).toContain('Voltar para revisão');
    expect(visits).toMatch(/visit\.needsReview \? \[\] : \[\{ key: 'unreview'/);
  });

  it('usa os nomes novos: Destinos visitados / Destino salvo', () => {
    expect(visits).toContain('title="Destinos visitados"');
    expect(visits).toContain('Destino salvo.');
    expect(visits).not.toContain('Visita salva');
  });
});
