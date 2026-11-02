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

  it('fica visível apenas para administradores, dentro de "Preparar publicação"', () => {
    expect(tripForm).toContain('canEditStatus &&');
    expect(tripForm).toContain('id="status"');
  });

  it('fica em "Preparar publicação", e não em "Ajustes avançados"', () => {
    const status = tripForm.indexOf('id="status"');
    const preparar = tripForm.indexOf('<FormSection title="Preparar publicação"');
    const ajustes = tripForm.indexOf('<FormSection title="Ajustes avançados"');
    expect(status).toBeGreaterThan(preparar);
    expect(status).toBeLessThan(ajustes);
    const ajustesBlock = tripForm.slice(ajustes);
    expect(ajustesBlock).not.toContain('id="status"');
  });
});
