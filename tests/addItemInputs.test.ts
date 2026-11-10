import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Campos de "adicionar item" ficam dentro do <form>; com `required` vazios, a validação
// nativa do navegador impede o envio do formulário sem aviso. Teste de código-fonte.
const tripForm = readFileSync('frontend/src/components/TripFormInputs.tsx', 'utf8');
const gallery = readFileSync('frontend/src/pages/Gallery.tsx', 'utf8');

const inputsOf = (src: string, from: string, to?: string) => {
  const start = src.indexOf(from);
  const end = to ? src.indexOf(to, start) : src.length;
  return (src.slice(start, end).match(/<input[^\n]*/g) ?? []);
};

describe('campos de adicionar item não bloqueiam o envio do formulário', () => {
  it('MediaInput e DeparturesInput não usam required', () => {
    const inputs = [
      ...inputsOf(tripForm, 'export function MediaInput', 'export function DeparturesInput'),
      ...inputsOf(tripForm, 'export function DeparturesInput'),
    ];
    expect(inputs.length).toBeGreaterThanOrEqual(8);
    for (const i of inputs) expect(i).not.toMatch(/(?<!aria-)\brequired\b/);
  });

  it('envio de foto fica dentro do formulário e também não usa required nativo', () => {
    const uploader = readFileSync('frontend/src/components/ImageUploader.tsx', 'utf8');
    const inputs = inputsOf(uploader, 'export default function ImageUploader');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    for (const i of inputs) expect(i).not.toMatch(/(?<!aria-)\brequired\b/);
  });

  it('campos de ponto de partida tratam Enter sem enviar o formulário da viagem', () => {
    const inputs = inputsOf(tripForm, 'export function DeparturesInput');
    expect(inputs.length).toBeGreaterThanOrEqual(5);
    for (const i of inputs) expect(i).toMatch(/onKeyDown=\{onEnter\}/);
  });

  it('linhas de imagem da galeria não usam required (validate() cuida disso)', () => {
    const rows = gallery.match(/<input[^\n]*setImage\(idx, \{ src[^\n]*/g) ?? [];
    expect(rows.length).toBe(1);
    for (const i of rows) expect(i).not.toMatch(/(?<!aria-)\brequired\b/);
  });
});
