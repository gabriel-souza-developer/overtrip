import { Router } from 'express';
import { tripController } from '../controllers/tripController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All trip routes require authentication
router.use(authenticate);

// Public read access for published trips could be added here
// For now, all routes require auth

router.get('/', asyncHandler(tripController.findAll));
router.get('/:id', asyncHandler(tripController.findById));
router.post('/', asyncHandler(tripController.create));
router.put('/:id', asyncHandler(tripController.update));
router.delete('/:id', asyncHandler(tripController.delete));
router.post('/:id/publish', asyncHandler(tripController.publish));
router.post('/:id/unpublish', asyncHandler(tripController.unpublish));

export default router;