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

const otpUnavailable = () =>
  new HttpError(503, 'EMAIL_UNAVAILABLE', 'Email codes are not available right now. Please use your password instead.');
const otpInvalid = () => new HttpError(400, 'OTP_INVALID', 'That code is incorrect or has expired.');

export function createAuthService({ userRepository, otpService, jwtSecret, jwtExpiresInSeconds, bcryptRounds }) {
  // Used to keep login timing similar whether or not the email exists.
  const dummyHash = bcrypt.hash('nutrilens-timing-equaliser', bcryptRounds);

  function signToken(userId) {
    return jwt.sign({}, jwtSecret, {
      algorithm: 'HS256',
      subject: String(userId),
      expiresIn: jwtExpiresInSeconds,
    });
  }

  /** The one place a session token is minted: every sign-in method ends here. */
  function createSession(user) {
    return { user: toPublicUser(user), token: signToken(user.id ?? user._id) };
  }

  function requireOtp() {
    if (!otpService) throw otpUnavailable();
    return otpService;
  }

  return {
    createSession,

    /**
     * Sign-up step 1. Nothing is created yet: the name and a bcrypt hash of the password wait,
     * inside the email challenge, until the person proves they own the inbox.
     */
    async registerStart({ name, email, password }) {
      const otp = requireOtp();
      if (await userRepository.findByEmail(email)) throw emailTaken();
      const passwordHash = await bcrypt.hash(password, bcryptRounds);
      return otp.send({ email, purpose: 'register', pending: { name, passwordHash }, enforceCooldown: true });
    },

    registerResend({ email }) {
      return requireOtp().resend({ email, purpose: 'register' });
    },

    /** Sign-up step 2: a correct code creates the already-verified account and signs it in. */
    async registerVerify({ email, code }) {
      const challenge = await requireOtp().verify({ email, purpose: 'register', code });
      const { name, passwordHash } = challenge.pending ?? {};
      if (!name || !passwordHash) throw otpInvalid();
      let user;
      try {
        user = await userRepository.create({
          name,
          email,
          passwordHash,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          authProviders: ['password'],
        });
      } catch (err) {
        // The email was taken between step 1 and now (for example through Google sign-in).
        if (err?.code === DUPLICATE_KEY_CODE) throw emailTaken();
        throw err;
      }
      return createSession(user);
    },

    /**
     * Passwordless login, step 1. The answer is identical whether or not the account exists:
     * a code is sent only if it does, and never for an address with no account.
     */
    async requestLoginOtp({ email }) {
      const otp = requireOtp();
      const user = await userRepository.findByEmail(email);
      if (user) {
        await otp.send({ email, purpose: 'login', enforceCooldown: false, background: true });
      } else {
        await otp.probe(email, 'login'); // a harmless read, so both paths do similar database work
      }
      return { ...otp.timing };
    },

    /** Passwordless login, step 2. Proves the inbox, so it also marks a legacy account verified. */
    async verifyLoginOtp({ email, code }) {
      await requireOtp().verify({ email, purpose: 'login', code });
      let user = await userRepository.findByEmail(email);
      if (!user) throw otpInvalid(); // an account deleted since the code was sent
      if (!user.emailVerified) user = (await userRepository.markEmailVerified(user.id ?? user._id, 'email_otp')) ?? user;
      return createSession(user);
    },

    async login({ email, password }) {
      const user = await userRepository.findByEmail(email);
      // Google-only and email-code-only accounts have no password hash: compare against the dummy
      // hash anyway (bcrypt throws on undefined) and answer exactly like a wrong password.
      const hash = user?.passwordHash;
      const matches = await bcrypt.compare(password, hash || (await dummyHash));
      if (!user || !hash || !matches) throw invalidCredentials();
      return createSession(user);
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
