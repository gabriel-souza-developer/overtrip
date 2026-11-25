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

  it('fica visível apenas para administradores', () => {
    expect(tripForm).toContain('canEditStatus &&');
    expect(tripForm).toContain('id="status"');
  });

  it('fica no bloco de Publicação, por último, e não escondido em "Mais opções"', () => {
    const status = tripForm.indexOf('id="status"');
    const essencial = tripForm.indexOf('>O essencial</h2>');
    const publicacaoStart = tripForm.indexOf('>Publicação</h2>');
    const publicacaoEnd = tripForm.indexOf('</fieldset>', publicacaoStart);
    expect(status).toBeGreaterThan(essencial);
    expect(status).toBeGreaterThan(publicacaoStart);
    expect(status).toBeLessThan(publicacaoEnd);
    const publicacaoBlock = tripForm.slice(publicacaoStart, publicacaoEnd);
    expect(publicacaoBlock).not.toContain('Mais opções');
  });
});
