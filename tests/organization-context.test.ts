import { describe, expect, it, vi } from 'vitest';
import { authorizeOrganization, requireOrganization, type OrganizationRequest } from '../src/middleware/organizationContext.js';
import type { Response } from 'express';

function request(userId: string | null, organizationId?: string): OrganizationRequest {
  return {
    user: userId ? { id: userId, email: 'test@example.com', role: 'admin', sessionVersion: new Date() } : undefined,
    get: () => organizationId,
  } as unknown as OrganizationRequest;
}

function response() {
  const result = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return result;
}

describe('contexto de empresa', () => {
  it('não permite acesso sem vínculo, mesmo para administrador global', async () => {
    const reader = { findActiveMembership: vi.fn().mockResolvedValue(null) };
    const req = request('user-a', 'org-b');
    const res = response();
    const next = vi.fn();
    await requireOrganization(reader)(req, res as unknown as Response, next);
    expect(reader.findActiveMembership).toHaveBeenCalledWith('user-a', 'org-b');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(req.organization).toBeUndefined();
  });

  it('usa o papel do vínculo para autorizar e rejeita empresa sem autenticação', async () => {
    const reader = { findActiveMembership: vi.fn().mockResolvedValue({ id: 'org-a', name: 'A', slug: 'a', niche: 'tourism', role: 'staff' }) };
    const unauthenticated = response();
    await requireOrganization(reader)(request(null, 'org-a'), unauthenticated as unknown as Response, vi.fn());
    expect(unauthenticated.status).toHaveBeenCalledWith(401);
    expect(reader.findActiveMembership).not.toHaveBeenCalled();
    const req = request('user-a', 'org-a');
    const next = vi.fn();
    await requireOrganization(reader)(req, response() as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
    const denied = response();
    authorizeOrganization('admin')(req, denied as unknown as Response, vi.fn());
    expect(denied.status).toHaveBeenCalledWith(403);
  });
});
