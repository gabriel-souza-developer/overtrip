import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const visits = readFileSync('frontend/src/pages/Visits.tsx', 'utf8');

describe('Visits.tsx', () => {
  it('cabeçalhos usam scope="col" (atributo válido em JSX)', () => {
    expect(visits).not.toContain('scope:col');
    expect(visits.match(/<th[\s>][^>]*>/g)?.every(th => th.includes('scope="col"'))).toBe(true);
  });

  it('coluna Coords virou Coordenadas', () => {
    expect(visits).not.toMatch(/>Coords</);
    expect(visits).toContain('>Coordenadas<');
  });

  it('latitude e longitude têm dica explicando o formato', () => {
    expect(visits.match(/Graus decimais/g)?.length).toBe(2);
  });
});
