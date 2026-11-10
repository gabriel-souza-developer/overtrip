import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TripCardPreview from '../frontend/src/components/TripCardPreview';

describe('prévia do card', () => {
  it('usa o nome da viagem como o site, mesmo quando existe título alternativo', () => {
    const html = renderToStaticMarkup(React.createElement(TripCardPreview, { trip: {
      title: 'Trilha em Lucena', headlineDisplay: 'Texto alternativo antigo', category: 'Natureza', description: '',
      city: 'Lucena', region: 'PB', startDateISO: '2026-11-29', departureTime: '', returnTime: '',
      scheduleInfo: '', scheduleTBD: false, priceValue: null, priceDisplay: '', priceUnit: '', free: false,
      meetingCity: '', meetingPoint: '', meetingTBD: false, media: [], buttonLabel: '', buttonClass: '', status: 'DRAFT', intensityClass: 'moderado', includes: ['Guia local'],
    } }));
    expect(html).toContain('Trilha em Lucena');
    expect(html).toContain('Natureza');
    expect(html).not.toContain('Texto alternativo antigo');
    expect(html).toContain('Nível:');
    expect(html).toContain('moderada');
    expect(html).toContain('Guia local');
  });
});
