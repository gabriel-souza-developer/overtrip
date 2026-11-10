import { Router } from 'express';
import { settingsController } from '../controllers/settingsController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(authenticate, authorize('admin'));
router.get('/whatsapp', asyncHandler(settingsController.getDefaultWhatsapp));
router.put('/whatsapp', asyncHandler(settingsController.updateDefaultWhatsapp));
router.get('/trip-presentation', asyncHandler(settingsController.getTripPresentationDefaults));
router.put('/trip-presentation', asyncHandler(settingsController.updateTripPresentationDefaults));
router.get('/public-faq', asyncHandler(settingsController.getPublicFaq));
router.put('/public-faq', asyncHandler(settingsController.publishPublicFaq));

export default router;
