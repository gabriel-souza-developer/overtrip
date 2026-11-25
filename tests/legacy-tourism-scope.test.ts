import { describe, it, expect } from 'vitest';
import { legacyTourismOrganizationFilter, legacyLeadOrganizationFilter, legacyReservationOrganizationFilter } from '../src/services/legacyTourismScope.js';

describe('legacyTourismOrganizationFilter', () => {
  it('sem organização legada configurada, restringe a organizationId null (dado legado)', () => {
    expect(legacyTourismOrganizationFilter(null)).toEqual({ organizationId: null });
  });

  it('com uma organização legada configurada, aceita null OU essa organização específica', () => {
    expect(legacyTourismOrganizationFilter('org-overtrip')).toEqual({
      OR: [{ organizationId: null }, { organizationId: 'org-overtrip' }],
    });
  });

  it('nunca inclui outra organização além da configurada', () => {
    const where = legacyTourismOrganizationFilter('org-overtrip');
    expect(JSON.stringify(where)).not.toContain('org-outra');
  });
});

describe('legacyLeadOrganizationFilter / legacyReservationOrganizationFilter', () => {
  it('seguem o mesmo formato de legacyTourismOrganizationFilter (mesma política de escopo)', () => {
    expect(legacyLeadOrganizationFilter(null)).toEqual({ organizationId: null });
    expect(legacyReservationOrganizationFilter(null)).toEqual({ organizationId: null });
    expect(legacyLeadOrganizationFilter('org-overtrip')).toEqual({
      OR: [{ organizationId: null }, { organizationId: 'org-overtrip' }],
    });
    expect(legacyReservationOrganizationFilter('org-overtrip')).toEqual({
      OR: [{ organizationId: null }, { organizationId: 'org-overtrip' }],
    });
  });
});
