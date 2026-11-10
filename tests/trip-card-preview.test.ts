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

  it('mostra horário como no site (05h30 às 17h00) e embarque "Cidade (Local)"', () => {
    const html = renderToStaticMarkup(React.createElement(TripCardPreview, { trip: {
      title: 'Trilha', headlineDisplay: '', category: '', description: '',
      city: 'Lucena', region: 'PB', startDateISO: '2026-11-29', departureTime: '05:30', returnTime: '17:00',
      scheduleInfo: '', scheduleTBD: true, priceValue: null, priceDisplay: '', priceUnit: '', free: false,
      meetingCity: 'Campina Grande', meetingPoint: 'Rodoviária Nova', meetingTBD: false, media: [], buttonLabel: '', buttonClass: '', status: 'COMPLETED',
    } }));
    expect(html).toContain('05h30 às 17h00');
    expect(html).not.toContain('Horário a confirmar');
    expect(html).toContain('Campina Grande (Rodoviária Nova)');
    expect(html).toContain('Realizada');
  });
});
