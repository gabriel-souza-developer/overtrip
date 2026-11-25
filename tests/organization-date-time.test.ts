import { describe, expect, it } from 'vitest';
import { fromLocalDateTime, toLocalDateTime } from '../frontend/src/lib/organizationDateTime';

describe('horário das viagens da organização', () => {
  it('preserva 21h em São Paulo mesmo quando o instante é meia-noite UTC', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      expect(toLocalDateTime('2030-01-02T00:00:00.000Z')).toBe('2030-01-01T21:00');
      expect(fromLocalDateTime('2030-01-01T21:00')).toBe('2030-01-02T00:00:00.000Z');
      expect(fromLocalDateTime('2030-01-01T21:00', '2030-01-02T00:00:00.000Z')).toBe('2030-01-02T00:00:00.000Z');
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
});
