import { Router } from 'express';
import { visitController } from '../controllers/visitController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(visitController.findAll));
router.get('/:id', asyncHandler(visitController.findById));
router.post('/', asyncHandler(visitController.create));
router.put('/:id', asyncHandler(visitController.update));
router.delete('/:id', asyncHandler(visitController.delete));
router.post('/:id/associate', asyncHandler(visitController.associateWithTrip));

export default router;