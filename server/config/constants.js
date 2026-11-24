export const API_PREFIX = '/api/v1';
export const AUTH_PREFIX = '/api/auth';
export const PROFILE_PREFIX = '/api/profile';
export const SCANS_PREFIX = '/api/scans';
// Image types the upload accepts. The real file contents are checked too, never just the label.
export const ALLOWED_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const SERVICE_NAME = 'nutrilens-api';
export const AUTH_COOKIE_NAME = 'nl_token';
// bcryptjs is pure JavaScript: 12 rounds is a sound default (about a quarter of a second per hash).
export const BCRYPT_ROUNDS = 12;
// Saved scans per user (keeps a free 512 MB database comfortable).
export const MAX_SAVED_SCANS = 200;

// ---------- Email OTP and Google sign-in ----------
export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60; // a code is valid for five minutes
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5; // wrong guesses allowed per code, then it is destroyed
// A Google sign-in nonce is single-use and short-lived: it binds the Google token to this browser.
export const GOOGLE_NONCE_TTL_SECONDS = 10 * 60;
export const GOOGLE_NONCE_COOKIE_NAME = 'nl_gnonce';
