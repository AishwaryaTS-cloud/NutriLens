import { asyncHandler } from '../utils/asyncHandler.js';
import { parseCookies } from '../utils/cookies.js';

/** Protects a route: reads the HTTP-only cookie, verifies it and sets req.user. */
export function createRequireAuth({ authService, cookieName }) {
  return asyncHandler(async (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[cookieName];
    req.user = await authService.authenticate(token);
    next();
  });
}
