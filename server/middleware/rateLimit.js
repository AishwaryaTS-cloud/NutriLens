import { HttpError } from '../utils/httpError.js';

/**
 * Small in-memory limiter for login and registration attempts, per client IP.
 * Limitation: counts live in this one process and reset on restart (a Redis-backed limiter
 * can replace it later). Behind a reverse proxy, set Express "trust proxy" so req.ip is the
 * real client address.
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  return function rateLimit(req, _res, next) {
    const now = Date.now();
    const key = req.ip || 'unknown';

    if (hits.size > 5000) {
      for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
    }

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'));
      return;
    }
    next();
  };
}
