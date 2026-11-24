import cors from 'cors';
import express from 'express';
import { API_PREFIX, AUTH_PREFIX, PROFILE_PREFIX, SCANS_PREFIX } from './config/constants.js';
import { createErrorHandler, notFound } from './middleware/errorHandler.js';
import { createUploadMiddleware } from './middleware/upload.js';
import { requestLogger } from './middleware/requestLogger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter } from './routes/health.js';
import { createProfileRouter } from './routes/profile.js';
import { createScansRouter } from './routes/scans.js';
import { createAuthService } from './services/authService.js';
import { createGoogleAuthService } from './services/googleAuthService.js';
import { createOtpService } from './services/otpService.js';
import { createProfileService } from './services/profileService.js';

const DEFAULT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };
// Each extraction uses one Gemini request (free-tier quota), so uploads are limited more tightly than logins.
const DEFAULT_EXTRACT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 20 };
const DEFAULT_ANALYSE_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 60 };
const DEFAULT_MAX_IN_FLIGHT_UPLOADS = 3;
// Email codes: per IP, per email per hour, once per cooldown per email; and checks per IP and per email.
const DEFAULT_OTP_RATE_LIMITS = {
  sendIp: { windowMs: 15 * 60 * 1000, max: 10 },
  sendEmail: { windowMs: 60 * 60 * 1000, max: 5 },
  sendCooldown: { windowMs: 60 * 1000, max: 1 },
  verifyIp: { windowMs: 15 * 60 * 1000, max: 30 },
  verifyEmail: { windowMs: 15 * 60 * 1000, max: 15 },
};

/**
 * `auth` = { jwtSecret, jwtExpiresInSeconds, bcryptRounds, cookie: { name, secure, sameSite, maxAgeMs } }
 * `userRepository` and `profileRepository` are injected so tests can use in-memory stores.
 * `emailService` + `otpRepository` + `otpSecret` switch on email codes; `googleVerifier` + `nonceRepository`
 * switch on Google sign-in (each is optional: without it that method answers 503, the rest keep working).
 * `trustProxy` is Express's "trust proxy" setting (hop count or addresses), never a blanket true.
 * `scanService` runs Gemini extraction, analysis and saved scans; `uploadLimits` = { maxBytes }.
 */
export function createApp({
  clientOrigin,
  environment,
  version,
  logger,
  getDatabaseState,
  userRepository,
  profileRepository,
  scanService,
  uploadLimits,
  auth,
  authRateLimit = DEFAULT_RATE_LIMIT,
  otpRateLimits = DEFAULT_OTP_RATE_LIMITS,
  emailService,
  otpRepository,
  otpSecret,
  googleVerifier,
  nonceRepository,
  trustProxy = false,
  now = Date.now,
  extractRateLimit = DEFAULT_EXTRACT_RATE_LIMIT,
  analyseRateLimit = DEFAULT_ANALYSE_RATE_LIMIT,
  maxInFlightUploads = DEFAULT_MAX_IN_FLIGHT_UPLOADS,
}) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy !== false) app.set('trust proxy', trustProxy);

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

  const otpService =
    emailService && otpRepository && otpSecret
      ? createOtpService({ otpRepository, emailService, otpSecret, now, logger })
      : undefined;
  const authService = createAuthService({
    userRepository,
    otpService,
    jwtSecret: auth.jwtSecret,
    jwtExpiresInSeconds: auth.jwtExpiresInSeconds,
    bcryptRounds: auth.bcryptRounds,
  });
  const googleAuthService = createGoogleAuthService({
    userRepository,
    authService,
    otpService,
    nonceRepository,
    googleVerifier,
    now,
  });
  app.use(
    AUTH_PREFIX,
    createAuthRouter({
      authService,
      googleAuthService,
      cookie: auth.cookie,
      clientOrigin,
      rateLimit: authRateLimit,
      otpRateLimits: { ...DEFAULT_OTP_RATE_LIMITS, ...otpRateLimits },
    }),
  );

  const profileService = createProfileService({ profileRepository, userRepository });
  app.use(
    PROFILE_PREFIX,
    createProfileRouter({ profileService, authService, cookieName: auth.cookie.name, clientOrigin }),
  );

  app.use(
    SCANS_PREFIX,
    createScansRouter({
      scanService,
      authService,
      cookieName: auth.cookie.name,
      clientOrigin,
      uploadMiddleware: createUploadMiddleware({ maxBytes: uploadLimits.maxBytes }),
      maxUploadBytes: uploadLimits.maxBytes,
      extractRateLimit,
      analyseRateLimit,
      maxInFlight: maxInFlightUploads,
    }),
  );

  app.use(notFound);
  app.use(createErrorHandler(logger));
  return app;
}
