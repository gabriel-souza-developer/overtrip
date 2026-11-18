import { describe, expect, it } from 'vitest';
import { formatOrganizationFollowUpDate, organizationFollowUpDate } from '../frontend/src/lib/organizationFollowUpDate';

describe('dia do próximo contato', () => {
  it('usa o dia de São Paulo para instantes e preserva datas antigas sem hora', () => {
    expect(organizationFollowUpDate('2030-01-02T01:00:00.000Z')).toBe('2030-01-01');
    expect(formatOrganizationFollowUpDate('2030-01-02T01:00:00.000Z')).toBe('01/01/2030');
    expect(organizationFollowUpDate('2030-01-02T00:00:00.000Z')).toBe('2030-01-02');
    expect(organizationFollowUpDate(null)).toBe('');
  });
});
