import { Router } from 'express';
import cors from 'cors';
import { publicTripsService } from '../services/publicTrips.js';
import { publicSiteService } from '../services/publicSite.js';
import { settingsService } from '../services/settingsService.js';
import { MEDIA_FILE_PATTERN, mediaDirectory, mediaFilePath } from '../services/mediaStorage.js';

const MEDIA_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

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

// Imagens enviadas pelo painel. O nome contém 128 bits aleatórios e o arquivo
// nunca muda depois de gravado: cache longo e imutável.
const MEDIA_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
router.get('/media/:file', async (req, res, next) => {
  try {
    const { file } = req.params;
    if (!MEDIA_FILE_PATTERN.test(file)) {
      res.set('Cache-Control', 'no-store').status(404).json({ error: 'Imagem não encontrada' });
      return;
    }
    const directory = await mediaDirectory();
    res.sendFile(mediaFilePath(directory, file), {
      dotfiles: 'deny',
      maxAge: MEDIA_MAX_AGE_MS,
      immutable: true,
      headers: {
        'Content-Type': MEDIA_TYPES[file.slice(file.lastIndexOf('.') + 1)],
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    }, (error?: Error & { status?: number; statusCode?: number }) => {
      if (!error) return;
      if (res.headersSent) return;
      if (error.status === 404 || error.statusCode === 404) {
        res.removeHeader('Content-Security-Policy');
        res.set('Cache-Control', 'no-store').status(404).json({ error: 'Imagem não encontrada' });
        return;
      }
      next(error);
    });
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
