import { Router } from 'express';
import { createAuthController } from '../controllers/authController.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireSameOrigin } from '../middleware/sameOrigin.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function createAuthRouter({ authService, cookie, clientOrigin, rateLimit }) {
  const router = Router();
  const controller = createAuthController({ authService, cookie });
  const requireAuth = createRequireAuth({ authService, cookieName: cookie.name });
  const limiter = createRateLimiter(rateLimit);

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSameOrigin(clientOrigin));

  router.post('/register', limiter, asyncHandler(controller.register));
  router.post('/login', limiter, asyncHandler(controller.login));
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);

  return router;
}
