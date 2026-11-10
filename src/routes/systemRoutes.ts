import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { config } from '../config.js';
import { readSystemHealth } from '../services/systemHealth.js';

const router = Router();

router.use(authenticate, authorize('admin'));
// Só lê o status.json do monitor; a API não executa comandos nem consulta o sistema.
router.get('/health', asyncHandler(async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await readSystemHealth(config.healthStatusFile));
}));

export default router;
