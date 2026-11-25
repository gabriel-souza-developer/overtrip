import { describe, expect, it } from 'vitest';
import {
  customImportantInfo,
  DEFAULT_IMPORTANT_INFO,
  FILTER_CATEGORY_OPTIONS,
  hasImportantInfoPreset,
  IMPORTANT_INFO_PRESETS,
  toggleImportantInfoPreset,
} from '../frontend/src/lib/tripFormOptions';

describe('opções reutilizáveis do formulário de viagem', () => {
  it('inicia as cinco orientações padrão selecionadas e permite desmarcá-las', () => {
    const selected = [...DEFAULT_IMPORTANT_INFO];
    expect(selected).toHaveLength(5);
    expect(selected.every(item => IMPORTANT_INFO_PRESETS.includes(item))).toBe(true);
    const remaining = toggleImportantInfoPreset(selected, selected[0]);
    expect(remaining).toEqual(selected.slice(1));
    expect(selected).toHaveLength(5);
  });
  it('oferece categorias de viagem curtas para o filtro do site', () => {
    expect(FILTER_CATEGORY_OPTIONS).toContain('Trilha');
    expect(FILTER_CATEGORY_OPTIONS).toContain('Experiência');
  });

  it('marca e desmarca orientações sem apagar outras informações', () => {
    const custom = 'O almoço é pago à parte.';
    const selected = toggleImportantInfoPreset([custom], IMPORTANT_INFO_PRESETS[0]);
    expect(hasImportantInfoPreset(selected, IMPORTANT_INFO_PRESETS[0])).toBe(true);
    expect(customImportantInfo(selected)).toEqual([custom]);
    expect(toggleImportantInfoPreset(selected, IMPORTANT_INFO_PRESETS[0])).toEqual([custom]);
  });
});
