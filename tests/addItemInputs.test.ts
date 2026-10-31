import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Campos de "adicionar item" ficam dentro do <form>; com `required` vazios, a validação
// nativa do navegador impede o envio do formulário sem aviso. Teste de código-fonte.
const tripForm = readFileSync('frontend/src/pages/TripForm.tsx', 'utf8');
const gallery = readFileSync('frontend/src/pages/Gallery.tsx', 'utf8');

const inputsOf = (src: string, from: string, to?: string) => {
  const start = src.indexOf(from);
  const end = to ? src.indexOf(to, start) : src.length;
  return (src.slice(start, end).match(/<input[^\n]*/g) ?? []);
};

describe('campos de adicionar item não bloqueiam o envio do formulário', () => {
  it('MediaInput e DeparturesInput não usam required', () => {
    const inputs = [
      ...inputsOf(tripForm, 'function MediaInput', 'function DeparturesInput'),
      ...inputsOf(tripForm, 'function DeparturesInput'),
    ];
    expect(inputs.length).toBeGreaterThanOrEqual(8);
    for (const i of inputs) expect(i).not.toMatch(/\brequired\b/);
  });

  it('linhas de imagem da galeria não usam required (validate() cuida disso)', () => {
    const rows = gallery.match(/<input[^\n]*handleImageChange[^\n]*/g) ?? [];
    expect(rows.length).toBe(2);
    for (const i of rows) expect(i).not.toMatch(/\brequired\b/);
  });
});
