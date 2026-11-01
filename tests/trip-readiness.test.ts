import { describe, expect, it } from 'vitest';
import { assistantProblems, hasClearDeparture, publicationProblems } from '../src/services/tripReadiness.js';

const complete = {
  title: 'Trilha do Jabre', city: 'Maturéia', region: 'PB', startDateISO: '2026-12-01T00:00:00.000Z',
  description: 'Uma experiência de natureza.', priceValue: 100, free: false, media: [{ src: 'foto.jpg' }],
  meetingCity: 'Campina Grande', status: 'OPEN', spotsLeft: 5,
};

describe('prontidão de viagem', () => {
  it('exige resumo, foto, preço e embarque para publicação', () => {
    expect(publicationProblems({ title: 'T', city: 'C', region: 'PB', startDateISO: '2026-01-01', free: false, media: [] }))
      .toEqual(expect.arrayContaining([
        'escreva um resumo da experiência',
        'adicione pelo menos uma foto',
        'informe o valor ou marque a viagem como gratuita',
        'informe o embarque ou marque-o como “a confirmar”',
      ]));
  });

  it('aceita embarque explicitamente a confirmar', () => {
    expect(hasClearDeparture({ meetingTBD: true })).toBe(true);
    expect(publicationProblems({ ...complete, meetingCity: null, meetingTBD: true })).toEqual([]);
  });

  it('só libera ao agente viagens abertas e com vagas', () => {
    expect(assistantProblems(complete)).toEqual([]);
    expect(assistantProblems({ ...complete, status: 'DRAFT' })).toContain('a viagem não está disponível para recomendação');
    expect(assistantProblems({ ...complete, spotsLeft: 0 })).toContain('não há vagas disponíveis para recomendação');
  });
});
