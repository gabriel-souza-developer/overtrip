import { Router } from 'express';
import { settingsController } from '../controllers/settingsController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(authenticate, authorize('admin'));
router.get('/whatsapp', asyncHandler(settingsController.getDefaultWhatsapp));
router.put('/whatsapp', asyncHandler(settingsController.updateDefaultWhatsapp));

export default router;
