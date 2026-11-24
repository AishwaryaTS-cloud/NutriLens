import { GOOGLE_NONCE_TTL_SECONDS } from '../config/constants.js';
import { HttpError } from '../utils/httpError.js';
import { generateNonce, hashNonce, safeEqual } from '../utils/otp.js';

const DUPLICATE_KEY_CODE = 11000;

const unavailable = () => new HttpError(503, 'GOOGLE_UNAVAILABLE', 'Google sign-in is not available right now.');
const nonceInvalid = () =>
  new HttpError(400, 'GOOGLE_NONCE_INVALID', 'This Google sign-in attempt expired. Please try again.');
const emailUnverified = () =>
  new HttpError(403, 'GOOGLE_EMAIL_UNVERIFIED', 'Your Google account email is not verified, so it cannot be used to sign in.');
const conflict = () =>
  new HttpError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'This email is already connected to a different Google account.');
const otpInvalid = () => new HttpError(400, 'OTP_INVALID', 'That code is incorrect or has expired.');

function displayName(payload, email) {
  const raw = String(payload.name ?? '').trim().replace(/\s+/g, ' ');
  const name = (raw.length >= 2 ? raw : email.split('@')[0]).slice(0, 60);
  return name.length >= 2 ? name : 'NutriLens user';
}

/**
 * Sign in / sign up with Google.
 * The browser gets an ID token from Google Identity Services. Nothing the browser says about who
 * the user is (id, email, verified flag) is trusted: everything comes from the token, which the
 * server verifies. No client secret exists in this flow.
 */
export function createGoogleAuthService({ userRepository, authService, otpService, nonceRepository, googleVerifier, now = Date.now }) {
  const requireVerifier = () => {
    if (!googleVerifier) throw unavailable();
    return googleVerifier;
  };

  return {
    ttlSeconds: GOOGLE_NONCE_TTL_SECONDS,

    /** A random single-use value Google puts inside the token, so a stolen token cannot be replayed. */
    async issueNonce() {
      requireVerifier();
      const nonce = generateNonce();
      await nonceRepository.create({ nonceHash: hashNonce(nonce), expiresAt: new Date(now() + GOOGLE_NONCE_TTL_SECONDS * 1000) });
      return nonce;
    },

    /**
     * Returns { session, isNewUser? } when signed in, or { verification } when an existing account's email is
     * not verified yet and a confirmation code was sent (the Google identity is NOT linked yet).
     */
    async signIn({ credential, nonce }) {
      const verifier = requireVerifier();
      if (!nonce) throw nonceInvalid();

      const payload = await verifier.verify(credential); // signature, issuer, audience, expiry

      // The nonce inside the signed token must equal the one this browser was given (cookie), and
      // it can be consumed only once, atomically.
      if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, nonce)) throw nonceInvalid();
      if (!(await nonceRepository.consume({ nonceHash: hashNonce(nonce), now: new Date(now()) }))) throw nonceInvalid();

      const email = String(payload.email ?? '').trim().toLowerCase();
      const googleId = String(payload.sub ?? '');
      if (!email || !googleId) throw new HttpError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified. Please try again.');
      if (payload.email_verified !== true) throw emailUnverified();

      // 1. Already linked: Google's stable id is the identity, whatever the email says today.
      const linked = await userRepository.findByGoogleId(googleId);
      if (linked) return { session: authService.createSession(linked) };

      const existing = await userRepository.findByEmail(email);

      // 2. Brand-new person: create a passwordless, already-verified account.
      if (!existing) {
        try {
          const user = await userRepository.create({
            name: displayName(payload, email),
            email,
            googleId,
            emailVerified: true,
            emailVerifiedAt: new Date(),
            authProviders: ['google'],
          });
          return { session: authService.createSession(user), isNewUser: true };
        } catch (err) {
          if (err?.code !== DUPLICATE_KEY_CODE) throw err;
          throw conflict(); // created by someone else a moment ago: let them try again
        }
      }

      if (existing.googleId && existing.googleId !== googleId) throw conflict();

      // 3. Existing account whose email was verified: both sides proved the same inbox, so link.
      if (existing.emailVerified) {
        try {
          const user = await userRepository.linkGoogle(existing.id ?? existing._id, googleId);
          return { session: authService.createSession(user ?? existing) };
        } catch (err) {
          if (err?.code === DUPLICATE_KEY_CODE) throw conflict();
          throw err;
        }
      }

      // 4. Existing account whose email was never verified (for example one made before email
      //    codes existed). A password proves nothing about the inbox, so do NOT link: email a
      //    code first. The Google identity waits in the challenge, taken from the verified token.
      if (!otpService) throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'Email codes are not available right now. Please use your password instead.');
      const timing = await otpService.send({
        email,
        purpose: 'link',
        link: { userId: String(existing.id ?? existing._id), googleId },
        enforceCooldown: false,
      });
      return { verification: { email, expiresInSeconds: timing.expiresInSeconds, resendAvailableInSeconds: timing.resendAvailableInSeconds } };
    },

    resendLink({ email }) {
      if (!otpService) throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'Email codes are not available right now. Please use your password instead.');
      return otpService.resend({ email, purpose: 'link' });
    },

    /** Completes linking after the emailed code is correct. Identity comes from the stored challenge only. */
    async verifyLink({ email, code }) {
      if (!otpService) throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'Email codes are not available right now. Please use your password instead.');
      const challenge = await otpService.verify({ email, purpose: 'link', code });
      const { userId, googleId } = challenge.link ?? {};
      const user = userId ? await userRepository.findById(userId) : null;
      if (!user || user.email !== email || !googleId) throw otpInvalid();
      if (user.googleId && user.googleId !== googleId) throw conflict();
      try {
        const linkedUser = await userRepository.linkGoogle(user.id ?? user._id, googleId);
        // The code also proved the inbox, so the email is now verified.
        const verified = (await userRepository.markEmailVerified(user.id ?? user._id, 'email_otp')) ?? linkedUser ?? user;
        return authService.createSession(verified);
      } catch (err) {
        if (err?.code === DUPLICATE_KEY_CODE) throw conflict();
        throw err;
      }
    },
  };
}
