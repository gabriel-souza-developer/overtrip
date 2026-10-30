import { Router } from 'express';
import { galleryController } from '../controllers/galleryController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(galleryController.findAll));
router.get('/:id', asyncHandler(galleryController.findById));
router.post('/', asyncHandler(galleryController.create));
router.put('/:id', asyncHandler(galleryController.update));
router.delete('/:id', asyncHandler(galleryController.delete));
router.post('/reorder', asyncHandler(galleryController.reorder));

export default router;