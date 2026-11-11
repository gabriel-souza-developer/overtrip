import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();

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
router.post('/change-password', authenticate, asyncHandler(authController.changePassword));

export default router;
