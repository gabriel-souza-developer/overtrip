import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Public routes
router.post('/login', loginRateLimiter, asyncHandler(authController.login));

// Protected routes
router.get('/me', authenticate, asyncHandler(authController.me));
router.post('/change-password', authenticate, asyncHandler(authController.changePassword));

export default router;