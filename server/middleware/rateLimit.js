import { HttpError } from '../utils/httpError.js';

/**
 * Small in-memory limiter. By default it counts per client IP (the original behaviour); pass
 * `key` to count per something else, such as the email address in the request body.
 * Limitation: counts live in this one process and reset on restart (a Redis-backed limiter can
 * replace it later). Behind a reverse proxy, set TRUST_PROXY so req.ip is the real client address.
 */
export function createRateLimiter({
  windowMs,
  max,
  key = (req) => req.ip || 'unknown',
  code = 'RATE_LIMITED',
  message = 'Too many attempts. Please wait a few minutes and try again.',
}) {
  const hits = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const id = key(req);

    if (hits.size > 5000) {
      for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
    }

    let entry = hits.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(id, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      if (typeof res?.set === 'function') res.set('Retry-After', String(retryAfterSeconds));
      next(new HttpError(429, code, message, { retryAfterSeconds }));
      return;
    }
    next();
  };
}

/** Rate-limit key: the (normalised) email in the JSON body, whether or not the account exists. */
export const emailKey = (req) => `email:${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254)}`;
