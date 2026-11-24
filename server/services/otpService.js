import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from '../config/constants.js';
import { HttpError } from '../utils/httpError.js';
import { generateOtp, hashOtp, safeEqual } from '../utils/otp.js';

const timing = { expiresInSeconds: OTP_TTL_SECONDS, resendAvailableInSeconds: OTP_RESEND_COOLDOWN_SECONDS };

const invalidCode = () => new HttpError(400, 'OTP_INVALID', 'That code is incorrect or has expired.');
// Only for sign-up and linking, where the user already knows a challenge exists. Never used for
// passwordless login, because there "attempts used up" would reveal that an account exists.
const tooManyAttempts = () =>
  new HttpError(400, 'OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect codes. Please request a new code.');

/**
 * Issues and checks six-digit email codes.
 *   otpRepository: atomic challenge storage
 *   emailService:  sends the email
 *   otpSecret:     key for the HMAC; never stored with the data
 *   now:           clock in milliseconds (injected so tests can move time)
 */
export function createOtpService({ otpRepository, emailService, otpSecret, now = Date.now, logger }) {
  const hashFor = (email, purpose, code) => hashOtp({ secret: otpSecret, email, purpose, code });

  async function deliver({ email, purpose, code, background }) {
    if (!background) return emailService.sendOtp({ to: email, code, purpose });
    // Passwordless login answers the same way (and as fast) whether or not the account exists,
    // so delivery happens off to the side and a failure is only logged.
    emailService.sendOtp({ to: email, code, purpose }).catch((err) => logger?.warn('Background OTP email failed', { code: err?.code }));
    return undefined;
  }

  return {
    timing,

    /** A read with no effect, used to keep the unknown-email login path shaped like the known one. */
    async probe(email, purpose) {
      await otpRepository.find(email, purpose);
    },

    /**
     * Creates a fresh code for (email, purpose) and emails it.
     * Within the resend cooldown nothing is sent: it throws 429 when `enforceCooldown`, otherwise
     * (passwordless login) it quietly does nothing so the response cannot reveal anything.
     */
    async send({ email, purpose, pending, link, enforceCooldown = true, background = false }) {
      const current = now();
      const existing = await otpRepository.find(email, purpose);
      if (existing) {
        const waitMs = new Date(existing.lastSentAt).getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - current;
        if (waitMs > 0) {
          if (enforceCooldown) {
            throw new HttpError(429, 'OTP_COOLDOWN', 'Please wait before requesting another code.', {
              retryAfterSeconds: Math.ceil(waitMs / 1000),
            });
          }
          return { sent: false, ...timing };
        }
      }

      const code = generateOtp(); // never logged, never returned
      await otpRepository.upsert({
        email,
        purpose,
        codeHash: hashFor(email, purpose, code),
        now: new Date(current),
        expiresAt: new Date(current + OTP_TTL_SECONDS * 1000),
        pending,
        link,
      });

      try {
        await deliver({ email, purpose, code, background });
      } catch (err) {
        // The email never went out, so drop the code: the user can retry immediately.
        await otpRepository.remove(email, purpose);
        throw err;
      }
      return { sent: true, ...timing };
    },

    /** Sends a new code for a sign-up or link that is already in progress, keeping its saved details. */
    async resend({ email, purpose }) {
      const existing = await otpRepository.find(email, purpose);
      if (!existing || new Date(existing.expiresAt).getTime() <= now()) {
        throw new HttpError(400, 'OTP_SESSION_EXPIRED', 'This verification has expired. Please start again.');
      }
      return this.send({ email, purpose, pending: existing.pending, link: existing.link, enforceCooldown: true });
    },

    /**
     * Checks a code. On success the challenge is consumed atomically (so the code works exactly
     * once, even with two simultaneous requests) and returned with its saved details. Wrong,
     * expired, used-up and never-issued codes all fail the same way.
     */
    async verify({ email, purpose, code }) {
      const counted = await otpRepository.incrementAttempts({
        email,
        purpose,
        now: new Date(now()),
        max: OTP_MAX_ATTEMPTS,
      });
      if (!counted) {
        // No live challenge, or its attempts are already used up: make sure nothing is left behind.
        const stale = await otpRepository.find(email, purpose);
        if (stale) {
          await otpRepository.remove(email, purpose);
          if (stale.attempts >= OTP_MAX_ATTEMPTS && purpose !== 'login') throw tooManyAttempts();
        }
        throw invalidCode();
      }

      const expected = counted.codeHash;
      const actual = hashFor(email, purpose, code);
      if (!safeEqual(expected, actual)) {
        if (counted.attempts >= OTP_MAX_ATTEMPTS) {
          await otpRepository.remove(email, purpose); // the fifth wrong guess destroys the code
          if (purpose !== 'login') throw tooManyAttempts();
        }
        throw invalidCode();
      }

      // Correct: delete-and-return in one step. If a parallel request got there first, this is null.
      const consumed = await otpRepository.consume({ id: counted._id, codeHash: expected });
      if (!consumed) throw invalidCode();
      return consumed;
    },
  };
}
