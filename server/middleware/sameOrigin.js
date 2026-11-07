import { HttpError } from '../utils/httpError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-based auth: browsers always send an Origin header on cross-site
 * POSTs, so a state-changing request from any origin other than the NutriLens client is refused.
 * Requests without an Origin header (curl, server-to-server, tests) are not browser CSRF.
 */
export function requireSameOrigin(allowedOrigin) {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== allowedOrigin) {
      return next(new HttpError(403, 'FORBIDDEN_ORIGIN', 'This request came from an origin that is not allowed.'));
    }
    return next();
  };
}
