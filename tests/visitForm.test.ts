import { describe, it, expect } from 'vitest';
import { visitToEditForm, reviewAfterSave } from '../frontend/src/lib/visitForm';
import { isoToLocalInput } from '../frontend/src/lib/dateInput';

const visit = {
  id: 'v1',
  tripId: 't1',
  title: 'Mirante da Pedra',
  description: null,
  date: '2026-03-10T12:30:00.000Z',
  city: 'Pocinhos',
  region: 'PB',
  lat: -7.1,
  lng: -36.2,
  images: null,
  storedIdentity: 'x',
  source: null,
  needsReview: true,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

describe('visitToEditForm', () => {
  it('preenche os campos obrigatórios com os dados da visita (sem isso Salvar fica travado)', () => {
    const form = visitToEditForm({ ...visit });
    expect(form.title).toBe('Mirante da Pedra');
    expect(form.city).toBe('Pocinhos');
    expect(form.region).toBe('PB');
  });

  it('converte data para o formato do input e completa campos opcionais', () => {
    const form = visitToEditForm({ ...visit });
    expect(form.date).toBe(isoToLocalInput(visit.date));
    expect(form.description).toBe('');
    expect(form.notes).toBe('');
    expect(form.lat).toBe(-7.1);
  });

  it('inclui a viagem associada, ou vazio quando não há', () => {
    expect(visitToEditForm({ ...visit }).tripId).toBe('t1');
    expect(visitToEditForm({ ...visit, tripId: null }).tripId).toBe('');
  });
});

describe('reviewAfterSave', () => {
  it('"Salvar e marcar como revisado" grava false, venha de onde vier', () => {
    expect(reviewAfterSave(true, true)).toBe(false);
    expect(reviewAfterSave(false, true)).toBe(false);
  });
  it('"Salvar" mantém a situação atual (pendente continua pendente, revisado continua revisado)', () => {
    expect(reviewAfterSave(true, false)).toBe(true);
    expect(reviewAfterSave(false, false)).toBe(false);
  });
  it('o formulário de edição não carrega mais a situação de revisão', () => {
    expect('needsReview' in visitToEditForm({ ...visit })).toBe(false);
  });
});
