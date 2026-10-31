import { Router } from 'express';
import cors from 'cors';
import { publicTripsService } from '../services/publicTrips.js';

const router = Router();

// Rota pública do site: sem login, CORS aberto e sem credenciais, só leitura.
router.use(cors({ origin: '*', methods: ['GET'], credentials: false }));

router.get('/trips', async (_req, res, next) => {
  try {
    const trips = await publicTripsService.list();
    res.set('Cache-Control', 'no-cache');
    res.json(trips);
  } catch (error) {
    next(error);
  }
});

export default router;
