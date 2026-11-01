import { describe, expect, it } from 'vitest';
import { customItems, hasItem, INCLUDE_PRESETS, mergeUnique, togglePreset } from '../frontend/src/lib/includesServices';

describe('serviços padrão do formulário de viagem', () => {
  it('marca e desmarca um serviço sem alterar os demais itens', () => {
    const marked = togglePreset(['Almoço'], INCLUDE_PRESETS[0]);
    expect(marked).toEqual(['Almoço', INCLUDE_PRESETS[0]]);
    expect(togglePreset(marked, INCLUDE_PRESETS[0])).toEqual(['Almoço']);
  });

  it('reconhece seleção sem diferenciar maiúsculas e espaços externos', () => {
    expect(hasItem(['  GUIA  '], 'Guia')).toBe(true);
  });

  it('separa itens próprios dos serviços padrão', () => {
    expect(customItems(['Guia', 'Banho de rio'])).toEqual(['Banho de rio']);
  });

  it('junta listas sem duplicar itens ignorando maiúsculas', () => {
    expect(mergeUnique(['Transporte', 'Guia'], ['guia', 'Kit lanche'])).toEqual([
      'Transporte', 'Guia', 'Kit lanche',
    ]);
  });
});
