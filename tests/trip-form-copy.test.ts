import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = readFileSync('frontend/src/pages/TripForm.tsx', 'utf8');
const preview = readFileSync('frontend/src/components/TripProposalPreview.tsx', 'utf8');

describe('textos do cadastro e da prévia da viagem', () => {
  it('explica as categorias e o texto de destaque pelo que aparece no site', () => {
    expect(form).toContain('label="Categoria da viagem"');
    expect(form).toContain('label="Texto de destaque no card"');
    expect(form).not.toContain('label="Categoria para o filtro"');
    expect(form).not.toContain('label="Chamada sobre a foto"');
  });

  it('descreve horários e opções com linguagem de viagem', () => {
    expect(form).toContain('label="Horário exibido no site"');
    expect(form).toContain('Outros detalhes da viagem');
    expect(form).toContain('label="Distância do percurso"');
    expect(form).not.toContain('label="Horário em texto livre"');
  });

  it('usa nomes claros nos dados e nas seções da proposta', () => {
    expect(preview).toContain('label="Agência ou organizador"');
    expect(preview).toContain('Local da viagem');
    expect(preview).toContain('Data de saída');
    expect(preview).toContain('Pontos de saída');
    expect(preview).toContain('O que está incluso');
  });
});
