import { Router } from 'express';
import { tripController } from '../controllers/tripController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All trip routes require authentication
router.use(authenticate);

// Public read access for published trips could be added here
// For now, all routes require auth

router.get('/', tripController.findAll);
router.get('/:id', tripController.findById);
router.post('/', tripController.create);
router.put('/:id', tripController.update);
router.delete('/:id', tripController.delete);
router.post('/:id/publish', tripController.publish);
router.post('/:id/unpublish', tripController.unpublish);

export default router;