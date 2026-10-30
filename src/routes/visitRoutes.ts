import { Router } from 'express';
import { visitController } from '../controllers/visitController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', visitController.findAll);
router.get('/:id', visitController.findById);
router.post('/', visitController.create);
router.put('/:id', visitController.update);
router.delete('/:id', visitController.delete);
router.post('/:id/associate', visitController.associateWithTrip);

export default router;