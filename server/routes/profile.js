import { Router } from 'express';
import { createProfileController } from '../controllers/profileController.js';
import { createRequireAuth } from '../middleware/auth.js';
import { requireSameOrigin } from '../middleware/sameOrigin.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function createProfileRouter({ profileService, authService, cookieName, clientOrigin }) {
  const router = Router();
  const controller = createProfileController({ profileService });

  router.use((_req, res, next) => {
    // Allergens and diet are personal data: never cache these responses.
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSameOrigin(clientOrigin)); // CSRF check first
  router.use(createRequireAuth({ authService, cookieName })); // then every route needs a session

  router.get('/', asyncHandler(controller.get));
  router.put('/preferences', asyncHandler(controller.savePreferences));
  router.patch('/', asyncHandler(controller.updateName));

  return router;
}
