import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';

const database = vi.hoisted(() => ({ membership: { findUnique: vi.fn() } }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: database }));
import { requireOrganizationMembership, type OrganizationRequest } from '../src/middleware/organizationContext.js';

describe('erros do contexto de empresa', () => {
  it('encaminha falha do banco para o tratamento de erros do Express', async () => {
    const failure = new Error('falha simulada');
    database.membership.findUnique.mockRejectedValueOnce(failure);
    const next = vi.fn();
    const req = { user: { id: 'u' }, params: { organizationId: 'o' } } as unknown as OrganizationRequest;
    await requireOrganizationMembership()(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(failure);
  });
});
