import { Router } from 'express';
import type { Response } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireOrganization, type OrganizationRequest } from '../middleware/organizationContext.js';
import { listUserOrganizations, organizationMembershipReader } from '../services/organizationMembership.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  // authenticate garante a identidade; nunca aceitar um userId do cliente.
  const organizations = await listUserOrganizations(req.user!.id);
  res.json({ organizations });
}));

// O vínculo é revalidado no banco a cada chamada; não habilita rotas legadas.
router.get('/current', authenticate, requireOrganization(organizationMembershipReader), (req: OrganizationRequest, res: Response) => {
  res.json({ organization: req.organization });
});

export default router;
