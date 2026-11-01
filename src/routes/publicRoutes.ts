import { Router } from 'express';
import cors from 'cors';
import { publicTripsService } from '../services/publicTrips.js';
import { publicSiteService } from '../services/publicSite.js';
import { settingsService } from '../services/settingsService.js';

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

router.get('/gallery', async (_req, res, next) => {
  try {
    const entries = await publicSiteService.gallery();
    res.set('Cache-Control', 'no-cache');
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

// Só destinos revisados e com coordenadas.
router.get('/destinations', async (_req, res, next) => {
  try {
    const destinations = await publicSiteService.destinations();
    res.set('Cache-Control', 'no-cache');
    res.json(destinations);
  } catch (error) {
    next(error);
  }
});

router.get('/settings/whatsapp', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-cache');
    res.json({ defaultWhatsapp: await settingsService.getDefaultWhatsapp() });
  } catch (error) {
    next(error);
  }
});

export default router;
