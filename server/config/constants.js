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
