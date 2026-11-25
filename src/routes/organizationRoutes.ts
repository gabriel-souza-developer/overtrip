import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireOrganizationMembership } from '../middleware/organizationContext.js';
import { organizationController } from '../controllers/organizationController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import organizationTripRoutes from './organizationTripRoutes.js';
import organizationLeadRoutes from './organizationLeadRoutes.js';
import organizationReservationRoutes from './organizationReservationRoutes.js';
import organizationDashboardRoutes from './organizationDashboardRoutes.js';
import organizationVisitRoutes from './organizationVisitRoutes.js';
import organizationGalleryRoutes from './organizationGalleryRoutes.js';
import organizationMediaRoutes from './organizationMediaRoutes.js';
import organizationSocialMediaRoutes from './organizationSocialMediaRoutes.js';
import organizationSocialPostRoutes from './organizationSocialPostRoutes.js';
import { createAiRouter } from './aiRoutes.js';

// Fundação isolada: nenhuma rota legada (trips, leads, reservas, site público)
// é montada ou alterada aqui. Primeira etapa de multiempresa — não implica
// isolamento de dados operacionais ainda.
const router = Router();

router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate);

router.get('/', asyncHandler(organizationController.listMine));
router.use('/:organizationId/tourism/dashboard', organizationDashboardRoutes);
router.use('/:organizationId/tourism/visits', organizationVisitRoutes);
router.use('/:organizationId/tourism/gallery', organizationGalleryRoutes);
router.use('/:organizationId/tourism/media', organizationMediaRoutes);
router.use('/:organizationId/tourism/social-media', organizationSocialMediaRoutes);
router.use('/:organizationId/tourism/social-posts', organizationSocialPostRoutes);
// A ajuda por texto não consulta dados da empresa: recebe apenas o texto
// enviado por seu operador. Nunca encaminhar para a rota legada, cujo acesso
// é reservado a operadores globais. Limitar também os caminhos expostos pelo
// roteador compartilhado, que possui outros recursos fora deste escopo.
const organizationTripAi = createAiRouter();
router.use('/:organizationId/tourism/ai', requireOrganizationMembership('OWNER', 'ADMIN'), (req, res, next) => {
  if (!((req.method === 'GET' && req.path === '/status') || (req.method === 'POST' && req.path === '/trip-draft'))) return next();
  organizationTripAi(req, res, next);
});
router.use('/:organizationId/tourism/trips', organizationTripRoutes);
router.use('/:organizationId/tourism/leads', organizationLeadRoutes);
router.use('/:organizationId/tourism/reservations', organizationReservationRoutes);
router.get('/:organizationId', requireOrganizationMembership(), asyncHandler(organizationController.getSelected));
// Único ajuste de empresa com paridade real com Configurações do painel
// OVERTRIP hoje (ver comentário em organizationController.updateSettings).
router.put('/:organizationId/settings', requireOrganizationMembership('OWNER', 'ADMIN'), asyncHandler(organizationController.updateSettings));

export default router;
