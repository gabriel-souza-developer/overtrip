import { describe, it, expect } from 'vitest';
import { fillMissingAlt, translateApiError } from '../frontend/src/lib/formHelpers';

describe('fillMissingAlt', () => {
  it('usa o título quando a descrição está vazia ou em branco', () => {
    const r = fillMissingAlt([{ src: 'a.jpg', alt: '' }, { src: 'b.jpg', alt: '   ' }], 'Trilha em Lucena');
    expect(r.map(i => i.alt)).toEqual(['Trilha em Lucena', 'Trilha em Lucena']);
  });
  it('preserva a descrição preenchida e os outros campos', () => {
    const r = fillMissingAlt([{ src: 'a.jpg', alt: ' Pôr do sol ', focus: 'center', type: 'video' as const }], 'T');
    expect(r[0]).toEqual({ src: 'a.jpg', alt: 'Pôr do sol', focus: 'center', type: 'video' });
  });
  it('usa texto genérico se nem o título existir', () => {
    expect(fillMissingAlt([{ src: 'a.jpg', alt: '' }], '  ')[0].alt).toBe('Foto');
  });
});

describe('translateApiError', () => {
  it('lista o que corrigir por campo', () => {
    const msg = translateApiError({
      error: 'Dados de entrada inválidos',
      details: [
        { field: 'title', message: 'Required' },
        { field: 'media.0.src', message: 'Invalid' },
      ],
    });
    expect(msg).toContain('Título');
    expect(msg).toContain('Foto 1');
    expect(msg).not.toContain('Dados de entrada inválidos');
    expect(msg).not.toMatch(/Required|Invalid/);
  });
  it('traduz mensagens comuns do Zod', () => {
    expect(translateApiError({ details: [{ field: 'description', message: 'String must contain at least 1 character(s)' }] }))
      .toContain('Descrição: preencha este campo');
  });
  it('sem details devolve o erro da API ou um texto padrão', () => {
    expect(translateApiError({ error: 'Registro duplicado' })).toBe('Registro duplicado');
    expect(translateApiError({})).toBe('Algo deu errado. Tente novamente.');
    expect(translateApiError({ error: 'Dados de entrada inválidos' })).toBe('Alguns dados estão incorretos. Confira os campos e tente de novo.');
  });
});

import { syncPriceDisplay, formatBRL } from '../frontend/src/lib/formHelpers';

describe('syncPriceDisplay', () => {
  it('100 para 120 atualiza o preço automático', () => {
    expect(syncPriceDisplay(100, 120, formatBRL(100))).toBe(formatBRL(120));
  });
  it('preserva texto personalizado', () => {
    expect(syncPriceDisplay(100, 120, 'a partir de R$ 99')).toBe('a partir de R$ 99');
  });
  it('vazio preenche', () => {
    expect(syncPriceDisplay(null, 100, '')).toBe(formatBRL(100));
  });
  it('zero ou vazio não gera preço', () => {
    expect(syncPriceDisplay(null, 0, '')).toBe('');
    expect(syncPriceDisplay(100, null, formatBRL(100))).toBe('');
    expect(syncPriceDisplay(100, 0, formatBRL(100))).toBe('');
  });
});
