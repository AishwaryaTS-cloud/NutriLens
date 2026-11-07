import { HttpError } from '../utils/httpError.js';
import { buildCookieOptions } from '../utils/cookies.js';
import { validateLogin, validateRegistration } from '../utils/validators.js';

function validationError(errors) {
  return new HttpError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', errors);
}

export function createAuthController({ authService, cookie }) {
  const options = buildCookieOptions(cookie);
  // Express 4's clearCookie must not receive maxAge, or the cookie would not expire.
  const { maxAge: _maxAge, ...clearOptions } = options;

  return {
    async register(req, res) {
      const input = validateRegistration(req.body);
      if (!input.valid) throw validationError(input.errors);
      const { user, token } = await authService.register(input.value);
      res.cookie(cookie.name, token, options);
      res.status(201).json({ user });
    },

    async login(req, res) {
      const input = validateLogin(req.body);
      if (!input.valid) throw validationError(input.errors);
      const { user, token } = await authService.login(input.value);
      res.cookie(cookie.name, token, options);
      res.json({ user });
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
