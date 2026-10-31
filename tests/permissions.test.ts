import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { canChangeTripStatus } from '../frontend/src/lib/permissions';

describe('canChangeTripStatus', () => {
  it('só administradores alteram a situação da viagem', () => {
    expect(canChangeTripStatus('admin')).toBe(true);
    expect(canChangeTripStatus('agent')).toBe(false);
    expect(canChangeTripStatus(undefined)).toBe(false);
  });
});

describe('campo Situação em TripForm.tsx', () => {
  const tripForm = readFileSync('frontend/src/pages/TripForm.tsx', 'utf8');

  it('fica desabilitado para quem não é administrador, com dica curta', () => {
    expect(tripForm).toContain('disabled={!canEditStatus}');
    expect(tripForm).toContain('Só administradores alteram a situação');
  });
});
