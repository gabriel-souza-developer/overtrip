import { describe, expect, it } from 'vitest';
import { followUpDateKey, followUpDateLabel } from '../frontend/src/lib/leadFollowUp';

describe('dia de acompanhamento no fuso da operação', () => {
  it('considera o dia de São Paulo nos limites da meia-noite UTC', () => {
    expect(followUpDateKey('2026-11-17T01:00:00.000Z')).toBe('2026-11-16');
    expect(followUpDateLabel('2026-11-17T01:00:00.000Z')).toBe('16/11/2026');
    expect(followUpDateKey('2026-11-17T03:00:00.000Z')).toBe('2026-11-17');
    expect(followUpDateKey('2026-11-17T12:00:00.000Z')).toBe('2026-11-17');
  });
  it('lida com datas ausentes ou inválidas', () => {
    expect(followUpDateKey(null)).toBe('');
    expect(followUpDateLabel('inválida')).toBe('—');
  });
});
