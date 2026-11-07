import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError } from '../utils/httpError.js';
import { toPublicUser } from '../utils/publicUser.js';

const DUPLICATE_KEY_CODE = 11000;

const emailTaken = () =>
  new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
    email: 'An account with this email already exists.',
  });
const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
const unauthenticated = () => new HttpError(401, 'UNAUTHENTICATED', 'Please log in to continue.');

export function createAuthService({ userRepository, jwtSecret, jwtExpiresInSeconds, bcryptRounds }) {
  // Used to keep login timing similar whether or not the email exists.
  const dummyHash = bcrypt.hash('nutrilens-timing-equaliser', bcryptRounds);

  function signToken(userId) {
    return jwt.sign({}, jwtSecret, {
      algorithm: 'HS256',
      subject: String(userId),
      expiresIn: jwtExpiresInSeconds,
    });
  }

  return {
    async register({ name, email, password }) {
      if (await userRepository.findByEmail(email)) throw emailTaken();
      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      let user;
      try {
        user = await userRepository.create({ name, email, passwordHash });
      } catch (err) {
        // Two simultaneous sign-ups: the unique index is the real guarantee.
        if (err?.code === DUPLICATE_KEY_CODE) throw emailTaken();
        throw err;
      }
      return { user: toPublicUser(user), token: signToken(user.id ?? user._id) };
    },

    async login({ email, password }) {
      const user = await userRepository.findByEmail(email);
      const matches = await bcrypt.compare(password, user ? user.passwordHash : await dummyHash);
      if (!user || !matches) throw invalidCredentials();
      return { user: toPublicUser(user), token: signToken(user.id ?? user._id) };
    },

    /** Verifies a token and loads the user, so deleted accounts lose access immediately. */
    async authenticate(token) {
      if (!token) throw unauthenticated();
      let payload;
      try {
        payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      } catch {
        throw unauthenticated();
      }
      const user = await userRepository.findById(payload.sub);
      if (!user) throw unauthenticated();
      return toPublicUser(user);
    },
  };
}
