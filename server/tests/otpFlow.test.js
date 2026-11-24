import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { hashOtp } from '../utils/otp.js';
import {
  TEST_JWT_SECRET,
  TEST_OTP_SECRET,
  codeFor,
  cookieFrom,
  createCapturingLogger,
  makeTestApp,
  postJson,
  request,
  setCookieHeader,
  validUser,
  withServer,
} from './helpers.js';

const start = (url, body = validUser, headers) => postJson(url, '/api/auth/register', body, headers);
const verify = (url, email, code) => postJson(url, '/api/auth/register/verify', { email, code });
const resend = (url, email) => postJson(url, '/api/auth/register/resend', { email });
const otpRequest = (url, email) => postJson(url, '/api/auth/otp/request', { email });
const otpVerify = (url, email, code) => postJson(url, '/api/auth/otp/verify', { email, code });
const me = (url, cookie) => request(url, '/api/auth/me', { headers: cookie ? { Cookie: cookie } : {} });
const wrongCode = (code) => (code === '000000' ? '000001' : '000000');
const MINUTE = 60_000;

/** Puts an account straight into the store, the way accounts created before email codes look. */
async function addLegacyUser(repo, overrides = {}) {
  return repo.create({ name: 'Old User', email: 'old@example.com', passwordHash: await bcrypt.hash('OldPassw0rd', 4), ...overrides });
}

describe('registration with an email code', () => {
  it('step 1 emails a six-digit code, creates NO account and no session, and never returns the code', async () => {
    const { app, userRepository, mailer } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await start(url);
      assert.equal(res.status, 202);
      assert.deepEqual(res.json, { email: 'asha@example.com', expiresInSeconds: 300, resendAvailableInSeconds: 60 });
      assert.equal(userRepository.users.size, 0, 'no account before the email is verified');
      assert.equal(setCookieHeader(res, 'nl_token'), undefined);
      assert.equal(mailer.outbox.length, 1);
      assert.equal(mailer.outbox[0].to, 'asha@example.com');
      assert.equal(mailer.outbox[0].purpose, 'register');
      assert.match(mailer.outbox[0].code, /^\d{6}$/);
      assert.ok(!res.text.includes(mailer.outbox[0].code), 'the code is never in the response');
    });
  });

  it('the right code creates a verified account, signs in with the existing JWT cookie and consumes the code', async () => {
    const { app, userRepository, otpRepository } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const res = await verify(url, validUser.email, codeFor(url, validUser.email, 'register'));
      assert.equal(res.status, 201);
      assert.equal(res.json.user.email, 'asha@example.com');
      assert.match(setCookieHeader(res, 'nl_token'), /HttpOnly/i);
      const stored = [...userRepository.users.values()][0];
      assert.equal(stored.emailVerified, true);
      assert.ok(stored.emailVerifiedAt instanceof Date);
      assert.deepEqual(stored.authProviders, ['password']);
      assert.match(stored.passwordHash, /^\$2[aby]\$/);
      assert.equal(otpRepository.challenges.size, 0, 'the challenge is gone after use');
      const payload = jwt.verify(cookieFrom(res, 'nl_token').split('=')[1], TEST_JWT_SECRET, { algorithms: ['HS256'] });
      assert.equal(payload.sub, res.json.user.id);
      assert.equal((await me(url, cookieFrom(res, 'nl_token'))).status, 200);
    });
  });

  it('stores only a keyed HMAC of the code and a bcrypt hash of the password, never plaintext', async () => {
    const { app, otpRepository } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      const row = [...otpRepository.challenges.values()][0];
      assert.equal(row.codeHash, hashOtp({ secret: TEST_OTP_SECRET, email: validUser.email, purpose: 'register', code }));
      const dump = JSON.stringify(row);
      assert.ok(!dump.includes(code), 'the code is not stored');
      assert.ok(!dump.includes(validUser.password), 'the password is not stored');
      assert.match(row.pending.passwordHash, /^\$2[aby]\$/);
      assert.equal(row.pending.name, 'Asha Rao');
      assert.ok(row.expiresAt.getTime() - row.lastSentAt.getTime() === 5 * MINUTE, 'expires five minutes after sending');
    });
  });

  it('accepts any email provider and normalises case and spaces', async () => {
    const { app, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      for (const email of ['person@gmail.com', 'person@outlook.com', 'person@yahoo.co.in', 'person@custom-domain.org']) {
        assert.equal((await start(url, { ...validUser, email: `  ${email.toUpperCase()} ` })).status, 202, email);
        assert.equal((await verify(url, email, codeFor(url, email, 'register'))).status, 201, email);
      }
      assert.equal(userRepository.users.size, 4);
    });
  });

  it('refuses an email that already has an account, and sends nothing', async () => {
    const { app, userRepository, mailer } = makeTestApp();
    await addLegacyUser(userRepository, { email: validUser.email });
    await withServer(app, async (url) => {
      const res = await start(url);
      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, 'EMAIL_TAKEN');
      assert.equal(mailer.outbox.length, 0);
    });
  });

  it('a wrong code fails with a generic error and creates nothing', async () => {
    const { app, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const res = await verify(url, validUser.email, wrongCode(codeFor(url, validUser.email, 'register')));
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'OTP_INVALID');
      assert.equal(setCookieHeader(res, 'nl_token'), undefined);
      assert.equal(userRepository.users.size, 0);
    });
  });

  it('a code works exactly once: reusing it fails', async () => {
    const { app, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      assert.equal((await verify(url, validUser.email, code)).status, 201);
      const again = await verify(url, validUser.email, code);
      assert.equal(again.status, 400);
      assert.equal(again.json.error.code, 'OTP_INVALID');
      assert.equal(userRepository.users.size, 1);
    });
  });

  it('two simultaneous requests with the right code create only one account', async () => {
    const { app, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      const results = await Promise.all(Array.from({ length: 6 }, () => verify(url, validUser.email, code)));
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(userRepository.users.size, 1);
    });
  });

  it('expires after five minutes (still valid at 4:59)', async () => {
    const { app, clock } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      clock.advance(5 * MINUTE - 1000);
      assert.equal((await verify(url, validUser.email, code)).status, 201, 'valid at 4 minutes 59 seconds');
    });
    const second = makeTestApp();
    await withServer(second.app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      second.clock.advance(5 * MINUTE + 1000);
      const res = await verify(url, validUser.email, code);
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'OTP_INVALID');
      assert.equal(second.userRepository.users.size, 0);
    });
  });

  it('allows five attempts: the fifth wrong guess destroys the code, even for the correct code afterwards', async () => {
    const { app, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      const bad = wrongCode(code);
      for (let i = 1; i <= 4; i += 1) assert.equal((await verify(url, validUser.email, bad)).json.error.code, 'OTP_INVALID', `attempt ${i}`);
      const fifth = await verify(url, validUser.email, bad);
      assert.equal(fifth.status, 400);
      assert.equal(fifth.json.error.code, 'OTP_ATTEMPTS_EXCEEDED');
      const afterwards = await verify(url, validUser.email, code);
      assert.equal(afterwards.status, 400, 'the correct code no longer works');
      assert.equal(userRepository.users.size, 0);
    });
  });

  it('the correct code on the fifth attempt still works (boundary)', async () => {
    const { app } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      for (let i = 0; i < 4; i += 1) await verify(url, validUser.email, wrongCode(code));
      assert.equal((await verify(url, validUser.email, code)).status, 201);
    });
  });

  it('a badly shaped code is a validation error and does not use up an attempt', async () => {
    const { app } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      for (const junk of ['', '12345', '1234567', 'abcdef', '12 456', null, 123456]) {
        const res = await verify(url, validUser.email, junk);
        assert.equal(res.status, 400);
        assert.equal(res.json.error.code, 'VALIDATION_ERROR');
        assert.ok(res.json.error.details.code);
      }
      assert.equal((await verify(url, validUser.email, code)).status, 201);
    });
  });

  it('enforces the 60-second resend cooldown, then sends a replacement that invalidates the old code', async () => {
    const { app, clock, mailer } = makeTestApp();
    await withServer(app, async (url) => {
      await start(url);
      const first = codeFor(url, validUser.email, 'register');
      const tooSoon = await resend(url, validUser.email);
      assert.equal(tooSoon.status, 429);
      assert.equal(tooSoon.json.error.code, 'OTP_COOLDOWN');
      assert.ok(tooSoon.json.error.details.retryAfterSeconds > 0 && tooSoon.json.error.details.retryAfterSeconds <= 60);
      assert.equal((await start(url)).status, 429, 'starting again is covered by the same cooldown');
      assert.equal(mailer.outbox.length, 1, 'nothing extra was sent');

      clock.advance(60 * 1000 + 1);
      const ok = await resend(url, validUser.email);
      assert.equal(ok.status, 202);
      assert.equal(ok.json.resendAvailableInSeconds, 60);
      assert.equal(mailer.outbox.length, 2);
      const second = codeFor(url, validUser.email, 'register');
      if (second !== first) assert.equal((await verify(url, validUser.email, first)).status, 400, 'the old code is replaced');
      assert.equal((await verify(url, validUser.email, second)).status, 201, 'the new code keeps the saved sign-up details');
    });
  });

  it('cannot resend when no sign-up is in progress, or after it expired', async () => {
    const { app, clock } = makeTestApp();
    await withServer(app, async (url) => {
      assert.equal((await resend(url, 'nobody@example.com')).json.error.code, 'OTP_SESSION_EXPIRED');
      await start(url);
      clock.advance(6 * MINUTE);
      assert.equal((await resend(url, validUser.email)).json.error.code, 'OTP_SESSION_EXPIRED');
    });
  });

  it('keeps working correctly when the email provider fails: generic 503, nothing left behind, instant retry', async () => {
    const { app, mailer, otpRepository, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      mailer.setFailing(true);
      const res = await start(url);
      assert.equal(res.status, 503);
      assert.equal(res.json.error.code, 'EMAIL_SEND_FAILED');
      assert.equal(otpRepository.challenges.size, 0, 'no code is left that the user never received');
      assert.equal(userRepository.users.size, 0);
      mailer.setFailing(false);
      assert.equal((await start(url)).status, 202, 'no cooldown is charged for an email that was never sent');
    });
  });

  it('answers 503 EMAIL_UNAVAILABLE when email is not configured, while password login keeps working', async () => {
    const { app, userRepository } = makeTestApp({ emailEnabled: false });
    await addLegacyUser(userRepository);
    await withServer(app, async (url) => {
      assert.equal((await start(url)).json.error.code, 'EMAIL_UNAVAILABLE');
      assert.equal((await otpRequest(url, 'old@example.com')).json.error.code, 'EMAIL_UNAVAILABLE');
      const login = await postJson(url, '/api/auth/login', { email: 'old@example.com', password: 'OldPassw0rd' });
      assert.equal(login.status, 200);
    });
  });

  it('never writes a code, password or email body to the logs', async () => {
    const logger = createCapturingLogger();
    const { app } = makeTestApp({ logger });
    await withServer(app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      await verify(url, validUser.email, wrongCode(code));
      await verify(url, validUser.email, code);
      const logged = logger.lines.join('\n');
      assert.ok(!logged.includes(code));
      assert.ok(!logged.includes(validUser.password));
    });
  });
});

describe('passwordless login with an email code', () => {
  async function appWithUser(options) {
    const made = makeTestApp(options);
    await addLegacyUser(made.userRepository, { email: 'asha@example.com', name: 'Asha Rao', emailVerified: true });
    return made;
  }

  it('logs in an existing account with the code, without a password, and creates no account', async () => {
    const { app, userRepository, mailer } = await appWithUser();
    await withServer(app, async (url) => {
      const res = await otpRequest(url, 'asha@example.com');
      assert.equal(res.status, 202);
      assert.equal(mailer.outbox[0].purpose, 'login');
      const login = await otpVerify(url, 'asha@example.com', codeFor(url, 'asha@example.com', 'login'));
      assert.equal(login.status, 200);
      assert.equal(login.json.user.email, 'asha@example.com');
      assert.match(setCookieHeader(login, 'nl_token'), /HttpOnly/i);
      assert.equal(userRepository.users.size, 1);
      assert.equal((await me(url, cookieFrom(login, 'nl_token'))).status, 200);
    });
  });

  it('does not reveal whether an email has an account: identical response, and no email for unknown addresses', async () => {
    const { app, mailer } = await appWithUser();
    await withServer(app, async (url) => {
      const known = await otpRequest(url, 'asha@example.com');
      const unknown = await otpRequest(url, 'nobody@example.com');
      assert.equal(known.status, unknown.status);
      assert.equal(known.json.message, unknown.json.message);
      assert.deepEqual(Object.keys(known.json).sort(), Object.keys(unknown.json).sort());
      assert.equal(known.json.expiresInSeconds, unknown.json.expiresInSeconds);
      assert.equal(known.json.resendAvailableInSeconds, unknown.json.resendAvailableInSeconds);
      assert.equal(mailer.sentTo('nobody@example.com'), 0, 'no email is ever sent to an address without an account');
      assert.equal(mailer.sentTo('asha@example.com'), 1);
    });
  });

  it('every kind of failure looks the same: wrong code, unknown email, expired, reused, attempts used up', async () => {
    const { app, clock } = await appWithUser();
    await withServer(app, async (url) => {
      await otpRequest(url, 'asha@example.com');
      const code = codeFor(url, 'asha@example.com', 'login');
      const outcomes = [];
      outcomes.push(await otpVerify(url, 'asha@example.com', wrongCode(code)));
      outcomes.push(await otpVerify(url, 'nobody@example.com', '123456'));
      for (let i = 0; i < 4; i += 1) outcomes.push(await otpVerify(url, 'asha@example.com', wrongCode(code))); // the 5th wrong guess
      outcomes.push(await otpVerify(url, 'asha@example.com', code)); // now destroyed
      for (const res of outcomes) {
        assert.equal(res.status, 400);
        assert.equal(res.json.error.code, 'OTP_INVALID');
        assert.equal(res.json.error.message, outcomes[0].json.error.message);
      }
      // reused and expired
      clock.advance(10 * MINUTE);
      await otpRequest(url, 'asha@example.com');
      const fresh = codeFor(url, 'asha@example.com', 'login');
      assert.equal((await otpVerify(url, 'asha@example.com', fresh)).status, 200);
      assert.equal((await otpVerify(url, 'asha@example.com', fresh)).json.error.code, 'OTP_INVALID');
      clock.advance(10 * MINUTE);
      await otpRequest(url, 'asha@example.com');
      const stale = codeFor(url, 'asha@example.com', 'login');
      clock.advance(5 * MINUTE + 1000);
      assert.equal((await otpVerify(url, 'asha@example.com', stale)).json.error.code, 'OTP_INVALID');
    });
  });

  it('a register code cannot be used to log in, and a login code cannot complete a registration', async () => {
    const { app, userRepository } = await appWithUser();
    await withServer(app, async (url) => {
      await start(url, { ...validUser, email: 'new@example.com' });
      const registerCode = codeFor(url, 'new@example.com', 'register');
      assert.equal((await otpVerify(url, 'new@example.com', registerCode)).status, 400);
      await otpRequest(url, 'asha@example.com');
      assert.equal((await verify(url, 'asha@example.com', codeFor(url, 'asha@example.com', 'login'))).status, 400);
      assert.equal(userRepository.users.size, 1);
    });
  });

  it('within the 60-second cooldown a repeat request quietly sends nothing, then sends again afterwards', async () => {
    const { app, clock, mailer } = await appWithUser();
    await withServer(app, async (url) => {
      assert.equal((await otpRequest(url, 'asha@example.com')).status, 202);
      assert.equal((await otpRequest(url, 'asha@example.com')).status, 202);
      assert.equal(mailer.sentTo('asha@example.com'), 1);
      clock.advance(61 * 1000);
      assert.equal((await otpRequest(url, 'asha@example.com')).status, 202);
      assert.equal(mailer.sentTo('asha@example.com'), 2);
    });
  });

  it('a successful code login also verifies a legacy account whose email was never verified', async () => {
    const { app, userRepository } = makeTestApp();
    const legacy = await addLegacyUser(userRepository, { email: 'legacy@example.com' });
    assert.equal(Boolean(legacy.emailVerified), false);
    await withServer(app, async (url) => {
      await otpRequest(url, 'legacy@example.com');
      assert.equal((await otpVerify(url, 'legacy@example.com', codeFor(url, 'legacy@example.com', 'login'))).status, 200);
      assert.equal(userRepository.users.get(legacy.id).emailVerified, true);
      assert.ok(userRepository.users.get(legacy.id).authProviders.includes('email_otp'));
    });
  });

  it('works for an account that has no password at all (Google-only)', async () => {
    const { app, userRepository } = makeTestApp();
    await userRepository.create({ name: 'Goog User', email: 'goog@example.com', googleId: 'g-1', emailVerified: true, authProviders: ['google'] });
    await withServer(app, async (url) => {
      await otpRequest(url, 'goog@example.com');
      assert.equal((await otpVerify(url, 'goog@example.com', codeFor(url, 'goog@example.com', 'login'))).status, 200);
    });
  });

  it('answers 202 even if the email provider is down (and never logs the code)', async () => {
    const logger = createCapturingLogger();
    const { app, mailer } = await appWithUser({ logger });
    await withServer(app, async (url) => {
      mailer.setFailing(true);
      const res = await otpRequest(url, 'asha@example.com');
      assert.equal(res.status, 202, 'a failure must not reveal that the account exists');
      assert.doesNotMatch(logger.lines.join('\n'), /\b\d{6}\b/);
    });
  });

  it('validates the email format', async () => {
    const { app } = await appWithUser();
    await withServer(app, async (url) => {
      const res = await otpRequest(url, 'not-an-email');
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'VALIDATION_ERROR');
    });
  });
});

describe('existing accounts and sessions keep working', () => {
  it('an account made before email codes existed (no new fields at all) can still log in with its password', async () => {
    const { app, userRepository } = makeTestApp();
    const legacy = await addLegacyUser(userRepository);
    delete legacy.emailVerified;
    delete legacy.authProviders;
    await withServer(app, async (url) => {
      const res = await postJson(url, '/api/auth/login', { email: 'old@example.com', password: 'OldPassw0rd' });
      assert.equal(res.status, 200);
      assert.equal(res.json.user.email, 'old@example.com');
      assert.equal((await me(url, cookieFrom(res, 'nl_token'))).status, 200);
    });
  });

  it('a session cookie issued the old way is still valid', async () => {
    const { app, userRepository } = makeTestApp();
    const legacy = await addLegacyUser(userRepository);
    const token = jwt.sign({}, TEST_JWT_SECRET, { algorithm: 'HS256', subject: legacy.id, expiresIn: 3600 });
    await withServer(app, async (url) => {
      assert.equal((await me(url, `nl_token=${token}`)).status, 200);
    });
  });

  it('an account with no password hash cannot crash password login: it gets the normal generic error', async () => {
    const { app, userRepository } = makeTestApp();
    await userRepository.create({ name: 'Goog User', email: 'goog@example.com', googleId: 'g-1', emailVerified: true });
    await addLegacyUser(userRepository);
    await withServer(app, async (url) => {
      const passwordless = await postJson(url, '/api/auth/login', { email: 'goog@example.com', password: 'Whatever123' });
      const wrong = await postJson(url, '/api/auth/login', { email: 'old@example.com', password: 'Whatever123' });
      assert.equal(passwordless.status, 401);
      assert.equal(passwordless.json.error.code, 'INVALID_CREDENTIALS');
      assert.equal(passwordless.json.error.message, wrong.json.error.message);
    });
  });
});

describe('rate limiting for email codes', () => {
  it('limits codes per email per hour, without affecting other emails', async () => {
    const { app, clock } = makeTestApp({ otpRateLimits: { sendEmail: { windowMs: 60_000, max: 2 } } });
    await withServer(app, async (url) => {
      assert.equal((await start(url)).status, 202);
      clock.advance(61_000);
      assert.equal((await resend(url, validUser.email)).status, 202);
      const third = await resend(url, validUser.email);
      assert.equal(third.status, 429);
      assert.equal(third.json.error.code, 'OTP_RATE_LIMITED');
      assert.equal((await start(url, { ...validUser, email: 'other@example.com' })).status, 202);
    });
  });

  it('applies the cooldown per email for unknown addresses exactly as for real ones (no existence oracle)', async () => {
    const { app, userRepository } = makeTestApp({ otpRateLimits: { sendCooldown: { windowMs: 60_000, max: 1 } } });
    await addLegacyUser(userRepository, { email: 'real@example.com' });
    await withServer(app, async (url) => {
      for (const email of ['real@example.com', 'ghost@example.com']) {
        assert.equal((await otpRequest(url, email)).status, 202);
        const again = await otpRequest(url, email);
        assert.equal(again.status, 429, email);
        assert.equal(again.json.error.code, 'OTP_COOLDOWN');
        assert.ok(again.headers['retry-after']);
      }
    });
  });

  it('limits code requests per IP address across different emails', async () => {
    const { app } = makeTestApp({ otpRateLimits: { sendIp: { windowMs: 60_000, max: 2 } } });
    await withServer(app, async (url) => {
      assert.equal((await otpRequest(url, 'a@example.com')).status, 202);
      assert.equal((await otpRequest(url, 'b@example.com')).status, 202);
      assert.equal((await otpRequest(url, 'c@example.com')).status, 429);
    });
  });

  it('limits code checks per email and per IP, answering 429 before looking at the code', async () => {
    const perEmail = makeTestApp({ otpRateLimits: { verifyEmail: { windowMs: 60_000, max: 3 } } });
    await withServer(perEmail.app, async (url) => {
      await start(url);
      const code = codeFor(url, validUser.email, 'register');
      for (let i = 0; i < 3; i += 1) assert.equal((await verify(url, validUser.email, wrongCode(code))).status, 400);
      const blocked = await verify(url, validUser.email, code);
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.error.code, 'OTP_RATE_LIMITED');
    });
    const perIp = makeTestApp({ otpRateLimits: { verifyIp: { windowMs: 60_000, max: 2 } } });
    await withServer(perIp.app, async (url) => {
      assert.equal((await otpVerify(url, 'a@example.com', '123456')).status, 400);
      assert.equal((await otpVerify(url, 'b@example.com', '123456')).status, 400);
      assert.equal((await otpVerify(url, 'c@example.com', '123456')).status, 429);
    });
  });

  it('refuses code requests from another origin (CSRF)', async () => {
    const { app } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await postJson(url, '/api/auth/otp/request', { email: 'a@example.com' }, { Origin: 'https://evil.example' });
      assert.equal(res.status, 403);
    });
  });
});

describe('TRUST_PROXY and the rate limiter', () => {
  const limited = { windowMs: 60_000, max: 1 };
  const loginFrom = (url, ip) => postJson(url, '/api/auth/login', { email: 'a@example.com', password: 'WrongPass123' }, { 'X-Forwarded-For': ip });

  it('ignores X-Forwarded-For by default, so a visitor cannot dodge the limit by inventing addresses', async () => {
    const { app } = makeTestApp({ authRateLimit: limited });
    await withServer(app, async (url) => {
      assert.equal((await loginFrom(url, '1.1.1.1')).status, 401);
      assert.equal((await loginFrom(url, '2.2.2.2')).status, 429, 'a different forged address does not reset the count');
    });
  });

  it('with one trusted proxy hop, limits each real client separately', async () => {
    const { app } = makeTestApp({ authRateLimit: limited, trustProxy: 1 });
    await withServer(app, async (url) => {
      assert.equal((await loginFrom(url, '1.1.1.1')).status, 401);
      assert.equal((await loginFrom(url, '2.2.2.2')).status, 401, 'a different real client has its own allowance');
      assert.equal((await loginFrom(url, '1.1.1.1')).status, 429);
    });
  });
});
