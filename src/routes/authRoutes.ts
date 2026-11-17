import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createRateLimiter, loginRateLimiter } from '../middleware/rateLimit.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
// Limite por usuário autenticado: contas na mesma rede não compartilham cota.
const passwordChangeLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyOf: req => (req as AuthRequest).user!.id });
// As respostas podem conter identidade e permissões da sessão.
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

// Public routes
router.post('/login', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== config.corsOrigin) {
    res.status(403).json({ error: 'Origem não autorizada para esta operação.' });
    return;
  }
  next();
}, loginRateLimiter, asyncHandler(authController.login));

// Protected routes
router.get('/me', authenticate, asyncHandler(authController.me));
router.post('/logout', (req, res, next) => authenticate(req, res, next, { optional: true }), asyncHandler(authController.logout));
router.post('/change-password', authenticate, passwordChangeLimiter, asyncHandler(authController.changePassword));

export default router;
