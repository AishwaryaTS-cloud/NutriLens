import { Router } from 'express';
import { createScanController } from '../controllers/scanController.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireSameOrigin } from '../middleware/sameOrigin.js';
import { createInFlightLimiter } from '../middleware/uploadGuards.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Order matters: same-origin check, then login, then limits, and only then the upload is read.
 * An anonymous or over-limit caller therefore never gets a body parsed or buffered.
 * Fixed paths (options, summary, compare, extract, analyse) are declared before "/:id".
 */
export function createScansRouter({ scanService, authService, cookieName, clientOrigin, uploadMiddleware, maxUploadBytes, extractRateLimit, analyseRateLimit, maxInFlight }) {
  const router = Router();
  const controller = createScanController({ scanService, maxUploadBytes });

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSameOrigin(clientOrigin));
  router.use(createRequireAuth({ authService, cookieName }));

  router.get('/options', controller.options);
  router.get('/summary', asyncHandler(controller.summary));
  router.get('/compare', asyncHandler(controller.compare));
  router.post('/extract', createRateLimiter(extractRateLimit), createInFlightLimiter({ max: maxInFlight }), ...uploadMiddleware, asyncHandler(controller.extract));
  router.post('/analyse', createRateLimiter(analyseRateLimit), asyncHandler(controller.analyse));

  router.get('/', asyncHandler(controller.list));
  router.post('/', asyncHandler(controller.save));
  router.get('/:id', asyncHandler(controller.get));
  router.delete('/:id', asyncHandler(controller.remove));
  return router;
}
