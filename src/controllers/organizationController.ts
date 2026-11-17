import { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { OrganizationRequest } from '../middleware/organizationContext.js';
import { AppError } from '../middleware/errorHandler.js';

export const organizationController = {
  async listMine(req: AuthRequest, res: Response) {
    if (!req.user) throw AppError.unauthorized('Não autenticado');

    const memberships = await prisma.membership.findMany({
      where: { userId: req.user.id, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    });
  },

  async getSelected(req: OrganizationRequest, res: Response) {
    if (!req.organizationContext) throw AppError.internal('Contexto de empresa ausente');

    res.json({
      organization: req.organizationContext.organization,
      role: req.organizationContext.membership.role,
    });
  },
};
