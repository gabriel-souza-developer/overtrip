import { describe, expect, it } from 'vitest';
import { calendarDays, tripDay, tripsByDay, upcomingTrips } from '../frontend/src/lib/tripCalendar';

describe('calendário das viagens', () => {
  it('preserva o dia de data sem horário salva à meia-noite UTC', () => {
    expect(tripDay('2026-11-29T00:00:00.000Z')).toBe('2026-11-29');
    expect(tripDay('inválida')).toBe('');
  });
  it('organiza dias de novembro e inclui espaços para semanas completas', () => {
    const days = calendarDays(2026, 10);
    expect(days[0]).toBe('2026-11-01');
    expect(days).toContain('2026-11-30');
    expect(days.length % 7).toBe(0);
  });
  it('agrupa várias viagens no mesmo dia e ignora datas inválidas', () => {
    const base = { status: 'DRAFT', city: 'Lucena', region: 'PB' };
    const grouped = tripsByDay([
      { ...base, id: '1', title: 'Trilha', startDateISO: '2026-11-29T00:00:00.000Z' },
      { ...base, id: '2', title: 'Praia', startDateISO: '2026-11-29T00:00:00.000Z' },
      { ...base, id: '3', title: 'Sem data', startDateISO: 'inválida' },
    ]);
    expect(grouped.get('2026-11-29')?.map(t => t.title)).toEqual(['Trilha', 'Praia']);
    expect(grouped.size).toBe(1);
  });
  it('mostra as próximas viagens em ordem, sem canceladas, concluídas ou datas passadas', () => {
    const base = { city: 'Lucena', region: 'PB' };
    const trips = [
      { ...base, id: 'futura', title: 'Outra', status: 'DRAFT', startDateISO: '2026-12-04T00:00:00.000Z' },
      { ...base, id: 'hoje', title: 'Hoje', status: 'OPEN', startDateISO: '2026-11-10T00:00:00.000Z' },
      { ...base, id: 'passada', title: 'Passada', status: 'OPEN', startDateISO: '2026-11-09T00:00:00.000Z' },
      { ...base, id: 'cancelada', title: 'Cancelada', status: 'CANCELLED', startDateISO: '2026-11-11T00:00:00.000Z' },
      { ...base, id: 'concluida', title: 'Concluída', status: 'COMPLETED', startDateISO: '2026-11-12T00:00:00.000Z' },
    ];
    expect(upcomingTrips(trips, '2026-11-10').map(t => t.id)).toEqual(['hoje', 'futura']);
  });
});
