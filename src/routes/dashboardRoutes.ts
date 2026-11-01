import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/stats', asyncHandler(dashboardController.getStats));

export default router;