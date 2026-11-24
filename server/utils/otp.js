import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_LENGTH } from '../config/constants.js';

/** A uniformly random six-digit code from the operating system's CSPRNG (leading zeros kept). */
export function generateOtp() {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

/**
 * HMAC-SHA-256 of the code, keyed with OTP_SECRET and bound to the email and purpose.
 * A plain hash of a six-digit code could be brute-forced in an instant if the database leaked;
 * with a secret key that never lives in the database, a leaked row alone reveals nothing.
 */
export function hashOtp({ secret, email, purpose, code }) {
  return createHmac('sha256', secret).update(`${purpose}\n${email}\n${code}`).digest('hex');
}

/** Constant-time comparison of two hex digests (different lengths simply compare as unequal). */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export const generateNonce = () => randomBytes(32).toString('base64url');
export const hashNonce = (nonce) => createHash('sha256').update(String(nonce)).digest('hex');
