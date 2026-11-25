import { Router, type Request, type Response, type NextFunction } from 'express';
import { authController } from '../controllers/authController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createRateLimiter, loginRateLimiter, forgotPasswordLimiter, resetPasswordLimiter } from '../middleware/rateLimit.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
// Limite por usuário autenticado: contas na mesma rede não compartilham cota.
const passwordChangeLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyOf: req => (req as AuthRequest).user!.id });
// As respostas podem conter identidade e permissões da sessão.
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

// Cookies não protegem estas rotas (não exigem sessão), mas um POST disparado
// por outra origem ainda pode martelar e-mail/tentativas de token de uma
// vítima; exigir a mesma origem do painel quando o cabeçalho vem presente
// fecha essa brecha (igual ao /login).
const requireSameOrigin = (req: Request, res: Response, next: NextFunction): void => {
  const origin = req.get('origin');
  if (origin && origin !== config.corsOrigin) {
    res.status(403).json({ error: 'Origem não autorizada para esta operação.' });
    return;
  }
  next();
};

// Public routes
router.post('/login', requireSameOrigin, loginRateLimiter, asyncHandler(authController.login));
router.post('/forgot-password', requireSameOrigin, forgotPasswordLimiter, asyncHandler(authController.forgotPassword));
router.post('/reset-password', requireSameOrigin, resetPasswordLimiter, asyncHandler(authController.resetPassword));

// Protected routes
router.get('/me', (req, res, next) => authenticate(req, res, next, { allowPasswordChange: true }), asyncHandler(authController.me));
router.post('/logout', (req, res, next) => authenticate(req, res, next, { optional: true, allowPasswordChange: true }), asyncHandler(authController.logout));
router.post('/change-password', (req, res, next) => authenticate(req, res, next, { allowPasswordChange: true }), passwordChangeLimiter, asyncHandler(authController.changePassword));

export default router;
