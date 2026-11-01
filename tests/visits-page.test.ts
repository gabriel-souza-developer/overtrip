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

  it('"Marcar revisada" usa o estilo secundário, não o laranja forte', () => {
    const button = visits.slice(visits.indexOf('<Button small'), visits.indexOf('Marcar revisada'));
    expect(button).toContain('variant="secondary"');
    expect(button).not.toContain('variant="primary"');
  });

  it('os filtros de revisão e de mapa têm a opção "não"', () => {
    expect(visits).toContain('Só as já revisadas');
    expect(visits).toContain('Só as sem local no mapa');
  });
});
