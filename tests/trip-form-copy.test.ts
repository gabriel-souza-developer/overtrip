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

  it('segue a ordem visual do cartão e deixa ações e ajudas opcionais discretas', () => {
    const order = [
      'Fotos da viagem', 'label="Intensidade da atividade"', 'label="Texto de destaque no card"',
      'label="Nome da viagem"', 'label="Resumo da experiência"', 'label="Data de saída"',
      'label="Horário de saída"', 'Embarque</span>', 'label="O que inclui"',
      'label="Roteiro"', 'label="Observações do percurso"', 'label="Informações importantes"',
      'label="Valor (R$)"',
    ].map(text => form.indexOf(text));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(form).not.toContain('Criar outra viagem com estes dados');
    expect(form).not.toContain('Um cadastro para sua viagem');
    expect(form).not.toContain('As ferramentas de IA e documentos');
    expect(form).toContain('Mais ações');
    expect(form).toContain('Sugerir preenchimento com PDF e IA (opcional)');
  });

  it('descreve horários e opções com linguagem de viagem', () => {
    expect(form).toContain('label="Horário como texto (opcional)"');
    expect(form).not.toContain('Outros detalhes da viagem');
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
