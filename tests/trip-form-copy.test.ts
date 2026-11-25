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

  it('segue a ordem dos blocos (essencial, embarque, experiência, roteiro, publicação) e deixa ajudas opcionais discretas', () => {
    const order = [
      'label="Nome da viagem"', 'label="Data de saída"', 'label="Valor (R$)"',
      'label="Horário da viagem"', 'Embarque</span>',
      'label="Resumo da experiência"', 'Fotos da viagem', 'label="Texto de destaque no card"', 'label="Intensidade da atividade"', 'label="O que inclui"',
      'label="Roteiro"', 'label="Informações importantes"', 'label="Observações do percurso"',
    ].map(text => form.indexOf(text));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(form).not.toContain('Criar outra viagem com estes dados');
    expect(form).not.toContain('Um cadastro para sua viagem');
    expect(form).not.toContain('As ferramentas de IA e documentos');
    expect(form).not.toContain('Mais ações');
    expect(form).toContain('Usar como modelo');
    expect(form).toContain('Sugerir preenchimento com PDF e IA (opcional)');
  });

  it('descreve horários e opções com linguagem de viagem', () => {
    expect(form).toContain('label="Horário da viagem"');
    expect(form).not.toContain('label="Horário como texto (opcional)"');
    expect(form).not.toContain('label="Horário de saída"');
    expect(form).not.toContain('label="Horário de volta"');
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
