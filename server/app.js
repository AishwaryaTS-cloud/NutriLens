import cors from 'cors';
import express from 'express';
import { API_PREFIX, AUTH_PREFIX, PROFILE_PREFIX } from './config/constants.js';
import { createErrorHandler, notFound } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter } from './routes/health.js';
import { createProfileRouter } from './routes/profile.js';
import { createAuthService } from './services/authService.js';
import { createProfileService } from './services/profileService.js';

const DEFAULT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };

/**
 * `auth` = { jwtSecret, jwtExpiresInSeconds, bcryptRounds, cookie: { name, secure, sameSite, maxAgeMs } }
 * `userRepository` and `profileRepository` are injected so tests can use in-memory stores.
 */
export function createApp({
  clientOrigin,
  environment,
  version,
  logger,
  getDatabaseState,
  userRepository,
  profileRepository,
  auth,
  authRateLimit = DEFAULT_RATE_LIMIT,
}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestLogger(logger));
  app.use(securityHeaders);
  // Strict CORS: only the configured client origin is ever echoed back in
  // Access-Control-Allow-Origin. Any other origin (and requests with no Origin header) get no CORS
  // headers at all, so browsers refuse to expose responses to other sites.
  app.use(
    cors({
      origin(requestOrigin, callback) {
        callback(null, requestOrigin === clientOrigin ? clientOrigin : false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use(`${API_PREFIX}/health`, createHealthRouter({ environment, version, getDatabaseState }));

  const authService = createAuthService({
    userRepository,
    jwtSecret: auth.jwtSecret,
    jwtExpiresInSeconds: auth.jwtExpiresInSeconds,
    bcryptRounds: auth.bcryptRounds,
  });
  app.use(
    AUTH_PREFIX,
    createAuthRouter({ authService, cookie: auth.cookie, clientOrigin, rateLimit: authRateLimit }),
  );

  const profileService = createProfileService({ profileRepository, userRepository });
  app.use(
    PROFILE_PREFIX,
    createProfileRouter({ profileService, authService, cookieName: auth.cookie.name, clientOrigin }),
  );

  app.use(notFound);
  app.use(createErrorHandler(logger));
  return app;
}
