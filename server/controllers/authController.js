import { GOOGLE_NONCE_COOKIE_NAME } from '../config/constants.js';
import { HttpError } from '../utils/httpError.js';
import { buildCookieOptions, parseCookies } from '../utils/cookies.js';
import {
  validateEmailOnly,
  validateGoogleCredential,
  validateLogin,
  validateOtpSubmission,
  validateRegistration,
} from '../utils/validators.js';

function validationError(errors) {
  return new HttpError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', errors);
}

export function createAuthController({ authService, googleAuthService, cookie }) {
  const options = buildCookieOptions(cookie);
  // Express 4's clearCookie must not receive maxAge, or the cookie would not expire.
  const { maxAge: _maxAge, ...clearOptions } = options;
  // The Google nonce cookie only needs to reach the /api/auth routes, and lives for ten minutes.
  const nonceOptions = { ...options, path: '/api/auth', maxAge: (googleAuthService?.ttlSeconds ?? 600) * 1000 };
  const { maxAge: _nonceMaxAge, ...nonceClearOptions } = nonceOptions;

  const signIn = (res, { user, token }, status = 200, extra = {}) => {
    res.cookie(cookie.name, token, options);
    res.status(status).json({ user, ...extra });
  };
  const timingBody = (email, t) => ({ email, expiresInSeconds: t.expiresInSeconds, resendAvailableInSeconds: t.resendAvailableInSeconds });

  return {
    /** Sign-up step 1: validates, then emails a code. No account exists yet. */
    async registerStart(req, res) {
      const input = validateRegistration(req.body);
      if (!input.valid) throw validationError(input.errors);
      const t = await authService.registerStart(input.value);
      res.status(202).json(timingBody(input.value.email, t));
    },

    async registerResend(req, res) {
      const input = validateEmailOnly(req.body);
      if (!input.valid) throw validationError(input.errors);
      const t = await authService.registerResend(input.value);
      res.status(202).json(timingBody(input.value.email, t));
    },

    /** Sign-up step 2: the code creates the verified account and starts the session. */
    async registerVerify(req, res) {
      const input = validateOtpSubmission(req.body);
      if (!input.valid) throw validationError(input.errors);
      signIn(res, await authService.registerVerify(input.value), 201);
    },

    async login(req, res) {
      const input = validateLogin(req.body);
      if (!input.valid) throw validationError(input.errors);
      signIn(res, await authService.login(input.value));
    },

    /** Passwordless login, step 1. The response never says whether the email has an account. */
    async otpRequest(req, res) {
      const input = validateEmailOnly(req.body);
      if (!input.valid) throw validationError(input.errors);
      const t = await authService.requestLoginOtp(input.value);
      res.status(202).json({
        message: 'If that email belongs to a NutriLens account, we have sent a 6-digit code to it.',
        ...timingBody(input.value.email, t),
      });
    },

    async otpVerify(req, res) {
      const input = validateOtpSubmission(req.body);
      if (!input.valid) throw validationError(input.errors);
      signIn(res, await authService.verifyLoginOtp(input.value));
    },

    async googleNonce(_req, res) {
      const nonce = await googleAuthService.issueNonce();
      res.cookie(GOOGLE_NONCE_COOKIE_NAME, nonce, nonceOptions);
      res.json({ nonce });
    },

    async google(req, res) {
      const input = validateGoogleCredential(req.body);
      if (!input.valid) throw validationError(input.errors);
      const nonce = parseCookies(req.headers.cookie)[GOOGLE_NONCE_COOKIE_NAME];
      // The nonce is single-use whatever happens next, so the cookie goes away either way.
      res.clearCookie(GOOGLE_NONCE_COOKIE_NAME, nonceClearOptions);
      const result = await googleAuthService.signIn({ credential: input.value.credential, nonce });
      if (result.session) return signIn(res, result.session, 200, { isNewUser: Boolean(result.isNewUser) });
      return res.status(202).json({ status: 'verification_required', ...result.verification });
    },

    async googleLinkResend(req, res) {
      const input = validateEmailOnly(req.body);
      if (!input.valid) throw validationError(input.errors);
      const t = await googleAuthService.resendLink(input.value);
      res.status(202).json(timingBody(input.value.email, t));
    },

    async googleLinkVerify(req, res) {
      const input = validateOtpSubmission(req.body);
      if (!input.valid) throw validationError(input.errors);
      signIn(res, await googleAuthService.verifyLink(input.value));
    },

    logout(_req, res) {
      res.clearCookie(cookie.name, clearOptions);
      res.json({ message: 'Logged out.' });
    },

    me(req, res) {
      res.json({ user: req.user });
    },
  };
}
