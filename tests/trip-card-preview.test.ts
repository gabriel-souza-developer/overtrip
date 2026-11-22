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

  it('usa previewSrc (leitura autenticada por empresa) na capa quando presente, nunca o caminho público', () => {
    const html = renderToStaticMarkup(React.createElement(TripCardPreview, { trip: {
      title: 'Trilha', headlineDisplay: '', category: '', description: '',
      city: '', region: '', startDateISO: '', departureTime: '', returnTime: '',
      scheduleInfo: '', scheduleTBD: false, priceValue: null, priceDisplay: '', priceUnit: '', free: false,
      meetingCity: '', meetingPoint: '', meetingTBD: false,
      media: [{ src: '/api/public/media/foto.jpg', alt: 'Capa', previewSrc: '/api/organizations/a/tourism/media/foto.jpg' }],
      buttonLabel: '', buttonClass: '', status: 'DRAFT',
    } }));
    expect(html).toContain('src="/api/organizations/a/tourism/media/foto.jpg"');
    expect(html).not.toContain('/api/public/media/foto.jpg');
  });

  it('sem previewSrc (prévia legada, sem empresa), cai de volta no caminho público de sempre', () => {
    const html = renderToStaticMarkup(React.createElement(TripCardPreview, { trip: {
      title: 'Trilha', headlineDisplay: '', category: '', description: '',
      city: '', region: '', startDateISO: '', departureTime: '', returnTime: '',
      scheduleInfo: '', scheduleTBD: false, priceValue: null, priceDisplay: '', priceUnit: '', free: false,
      meetingCity: '', meetingPoint: '', meetingTBD: false,
      media: [{ src: 'assets/images/foto.jpg', alt: 'Capa' }],
      buttonLabel: '', buttonClass: '', status: 'DRAFT',
    } }));
    expect(html).toContain('src="/assets/images/foto.jpg"');
  });
});
