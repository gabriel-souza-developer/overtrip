import { describe, expect, it } from 'vitest';
import { fieldsToSchedule, scheduleToFields } from '../frontend/src/lib/tripSchedule';

describe('datas e horários da viagem', () => {
  it('divide os valores salvos em campos de data e hora', () => {
    expect(scheduleToFields({
      startDateISO: '2026-11-21T09:30:00.000Z', departureTime: null,
      endDateISO: '2026-11-21T00:00:00.000Z', returnTime: '18h45',
    })).toMatchObject({ startDate: expect.any(String), startTime: expect.any(String), endDate: '2026-11-21', endTime: '18:45' });
  });

  it('preserva os valores originais quando nenhum campo muda', () => {
    const original = { startDateISO: '2026-11-21T12:30:00.000Z', departureTime: null, endDateISO: null, returnTime: null };
    const fields = scheduleToFields(original);
    expect(fieldsToSchedule(fields, original)).toEqual(original);
  });

  it('mantém a hora que estava embutida no ISO ao alterar somente a data', () => {
    const original = { startDateISO: '2026-11-21T12:30:00.000Z', departureTime: null, endDateISO: null, returnTime: null };
    const fields = scheduleToFields(original);
    const updated = fieldsToSchedule({ ...fields, startDate: '2026-11-22' }, original);
    expect(updated.startDateISO).toBe('2026-11-22T00:00:00.000Z');
    expect(updated.departureTime).toBe(fields.startTime.replace(':', 'h'));
  });

  it('salva uma viagem nova com data sem fuso e hora no campo próprio', () => {
    expect(fieldsToSchedule({ startDate: '2026-12-03', startTime: '06:15', endDate: '', endTime: '' })).toEqual({
      startDateISO: '2026-12-03T00:00:00.000Z', departureTime: '06h15', endDateISO: null, returnTime: null,
    });
  });
});
