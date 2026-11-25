import { Router, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireOrganizationMembership, type OrganizationRequest } from '../middleware/organizationContext.js';
import { tripPeriodWhere } from '../utils/tripPeriod.js';

const router = Router({ mergeParams: true });
router.use(requireOrganizationMembership());

router.get('/', asyncHandler(async (req: OrganizationRequest, res: Response) => {
  const { organization, membership } = req.organizationContext!;
  const where = { organizationId: organization.id };
  const canViewPrivate = membership.role === 'OWNER' || membership.role === 'ADMIN';
  const summary = await prisma.$transaction(async tx => {
    const [total, upcoming, open, drafts] = await Promise.all([
      tx.trip.count({ where }), tx.trip.count({ where: { ...where, ...tripPeriodWhere('upcoming') } }),
      tx.trip.count({ where: { ...where, status: 'OPEN' } }), tx.trip.count({ where: { ...where, status: 'DRAFT' } }),
    ]);
    if (!canViewPrivate) return { trips: { total, upcoming, open, drafts } };
    const [leads, reservations] = await Promise.all([
      tx.lead.count({ where }), tx.reservation.count({ where: { ...where, trip: { is: where } } }),
    ]);
    return { trips: { total, upcoming, open, drafts }, leads, reservations };
  });
  res.json(summary);
}));

export default router;
