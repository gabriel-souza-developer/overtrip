import { prisma } from '../lib/prisma.js';
import type { MembershipReader } from '../middleware/organizationContext.js';

/** Consulta atual: a desativação da empresa ou remoção do vínculo é imediata. */
export const organizationMembershipReader: MembershipReader = {
  async findActiveMembership(userId, organizationId) {
    const membership = await prisma.membership.findFirst({
      where: { userId, organizationId, organization: { status: 'ACTIVE' } },
      select: { role: true, organization: { select: { id: true, name: true, slug: true, niche: true } } },
    });
    return membership ? { ...membership.organization, role: membership.role } : null;
  },
};

/** Lista somente espaços ativos aos quais a conta atual está vinculada. */
export async function listUserOrganizations(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, organization: { status: 'ACTIVE' } },
    select: { role: true, organization: { select: { id: true, name: true, slug: true, niche: true } } },
    orderBy: { organization: { name: 'asc' } },
  });
  return memberships.map(({ role, organization }) => ({ ...organization, role }));
}
