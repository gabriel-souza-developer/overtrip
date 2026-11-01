import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tripListAction, parseWholeNumber } from '../frontend/src/lib/panelHelpers';

// Teste de código-fonte da lista de viagens.
const trips = readFileSync('frontend/src/pages/Trips.tsx', 'utf8');
const form = readFileSync('frontend/src/pages/TripForm.tsx', 'utf8');

describe('lista de viagens', () => {
  it('os botões de situação vêm de tripListAction e só para quem pode mudar a situação', () => {
    expect(trips).toContain('tripListAction(trip.status, isAdmin)');
    expect(trips).toContain('canChangeTripStatus(user?.role)');
    expect(trips).toMatch(/\{action && \(/);
    expect(trips).not.toMatch(/trip\.status === 'OPEN'/);
  });

  it('publicar passa pela mesma regra do formulário antes de chamar a API', () => {
    const publish = trips.slice(trips.indexOf('const publish = async'), trips.indexOf('const unpublish'));
    expect(publish.indexOf('publishProblems(trip)')).toBeGreaterThan(-1);
    expect(publish.indexOf('publishProblems(trip)')).toBeLessThan(publish.indexOf('tripApi.publish'));
  });

  it('datas da lista e do formulário usam as funções que respeitam o dia certo', () => {
    expect(trips).not.toContain('toLocaleDateString');
    expect(trips).toContain('formatDateBR');
    expect(form).toContain('scheduleToFields(');
    expect(form).toContain('fieldsToSchedule({');
  });
});

describe('formulário de viagem', () => {
  it('o campo de valor aceita vírgula e a dica não manda digitar com ponto', () => {
    expect(form).toContain('parsePriceInput');
    expect(form).not.toContain('digite 109.99');
    expect(form).toContain('109,99 ou 1.250,00');
  });
});

describe('tripListAction', () => {
  it('administrador: Publicar só em rascunho', () => expect(tripListAction('DRAFT', true)).toBe('publish'));
  it('administrador: Tirar do site só em publicada, esgotada e fechada', () => {
    for (const status of ['OPEN', 'SOLD_OUT', 'CLOSED']) expect(tripListAction(status, true)).toBe('unpublish');
  });
  it('concluída e cancelada não têm botão', () => {
    expect(tripListAction('COMPLETED', true)).toBeNull();
    expect(tripListAction('CANCELLED', true)).toBeNull();
  });
  it('quem não é administrador não vê botão em nenhuma situação', () => {
    for (const status of ['DRAFT', 'OPEN', 'SOLD_OUT', 'CLOSED', 'COMPLETED', 'CANCELLED']) {
      expect(tripListAction(status, false)).toBeNull();
    }
  });
});

describe('parseWholeNumber', () => {
  it('só inteiro: descarta ponto, vírgula e letras', () => {
    expect(parseWholeNumber('12')).toBe(12);
    expect(parseWholeNumber('1.5')).toBe(15);
    expect(parseWholeNumber('3,7')).toBe(37);
    expect(parseWholeNumber('0')).toBe(0);
    expect(parseWholeNumber('abc')).toBeNull();
    expect(parseWholeNumber('')).toBeNull();
  });
  it('o campo de vagas usa parseWholeNumber', () => {
    expect(form).toContain('parseWholeNumber(e.target.value)');
  });
});
