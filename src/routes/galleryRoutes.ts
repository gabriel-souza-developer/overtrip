import { Router } from 'express';
import { galleryController } from '../controllers/galleryController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', galleryController.findAll);
router.get('/:id', galleryController.findById);
router.post('/', galleryController.create);
router.put('/:id', galleryController.update);
router.delete('/:id', galleryController.delete);
router.post('/reorder', galleryController.reorder);

export default router;