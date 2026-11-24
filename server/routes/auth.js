import { Router } from 'express';
import { createAuthController } from '../controllers/authController.js';
import { createRequireAuth } from '../middleware/auth.js';
import { createRateLimiter, emailKey } from '../middleware/rateLimit.js';
import { requireSameOrigin } from '../middleware/sameOrigin.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function createAuthRouter({ authService, googleAuthService, cookie, clientOrigin, rateLimit, otpRateLimits }) {
  const router = Router();
  const controller = createAuthController({ authService, googleAuthService, cookie });
  const requireAuth = createRequireAuth({ authService, cookieName: cookie.name });
  const limiter = createRateLimiter(rateLimit); // per IP: password login and Google

  // Sending a code is limited per IP, per email per hour, and once per cooldown per email.
  // The email counters apply whether or not an account exists, so they reveal nothing.
  const sendLimits = [
    createRateLimiter({ ...otpRateLimits.sendIp, code: 'OTP_RATE_LIMITED', message: 'Too many code requests. Please wait a while and try again.' }),
    createRateLimiter({ ...otpRateLimits.sendEmail, key: emailKey, code: 'OTP_RATE_LIMITED', message: 'Too many codes requested for this email. Please try again later.' }),
    createRateLimiter({ ...otpRateLimits.sendCooldown, key: emailKey, code: 'OTP_COOLDOWN', message: 'Please wait before requesting another code.' }),
  ];
  // Checking a code is limited per IP and per email, on top of the five-guesses-per-code rule.
  const verifyLimits = [
    createRateLimiter({ ...otpRateLimits.verifyIp, code: 'OTP_RATE_LIMITED', message: 'Too many attempts. Please wait a while and try again.' }),
    createRateLimiter({ ...otpRateLimits.verifyEmail, key: emailKey, code: 'OTP_RATE_LIMITED', message: 'Too many attempts for this email. Please wait a while and try again.' }),
  ];

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSameOrigin(clientOrigin));

  router.post('/register', ...sendLimits, asyncHandler(controller.registerStart));
  router.post('/register/resend', ...sendLimits, asyncHandler(controller.registerResend));
  router.post('/register/verify', ...verifyLimits, asyncHandler(controller.registerVerify));
  router.post('/login', limiter, asyncHandler(controller.login));
  router.post('/otp/request', ...sendLimits, asyncHandler(controller.otpRequest));
  router.post('/otp/verify', ...verifyLimits, asyncHandler(controller.otpVerify));
  router.get('/google/nonce', limiter, asyncHandler(controller.googleNonce));
  router.post('/google', limiter, asyncHandler(controller.google));
  router.post('/google/link/resend', ...sendLimits, asyncHandler(controller.googleLinkResend));
  router.post('/google/link/verify', ...verifyLimits, asyncHandler(controller.googleLinkVerify));
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);

  return router;
}
