import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  TEST_JWT_SECRET,
  cookieFrom,
  codeFor,
  createCapturingLogger,
  makeTestApp,
  postJson,
  request,
  setCookieHeader,
  withServer,
} from './helpers.js';
import { hashNonce } from '../utils/otp.js';

const MINUTE = 60_000;
const nonceRes = (url) => request(url, '/api/auth/google/nonce');
const me = (url, cookie) => request(url, '/api/auth/me', { headers: cookie ? { Cookie: cookie } : {} });

/**
 * One complete browser-style Google sign-in: get a nonce (+cookie), have "Google" sign a token that
 * contains it, post the token. Every part can be overridden to build a specific attack.
 */
async function googleSignIn(url, kit, claims = {}, { tokenNonce, cookie, credential, signWith, skipNonceCookie } = {}) {
  const n = await nonceRes(url);
  const nonce = n.json?.nonce;
  const token = credential ?? kit.sign({ nonce: tokenNonce === undefined ? nonce : tokenNonce, ...claims }, { signWith });
  const nonceCookie = skipNonceCookie ? undefined : cookie ?? cookieFrom(n, 'nl_gnonce');
  return postJson(url, '/api/auth/google', { credential: token }, nonceCookie ? { Cookie: nonceCookie } : {});
}

async function addUser(repo, overrides = {}) {
  return repo.create({ name: 'Local User', email: 'asha@example.com', passwordHash: await bcrypt.hash('LocalPassw0rd', 4), ...overrides });
}

describe('GET /api/auth/google/nonce', () => {
  it('issues a random single-use nonce, bound to the browser by an HTTP-only cookie, and stores only its hash', async () => {
    const { app, nonceRepository } = makeTestApp();
    await withServer(app, async (url) => {
      const a = await nonceRes(url);
      const b = await nonceRes(url);
      assert.equal(a.status, 200);
      assert.match(a.json.nonce, /^[\w-]{43}$/);
      assert.notEqual(a.json.nonce, b.json.nonce);
      const header = setCookieHeader(a, 'nl_gnonce');
      assert.match(header, /HttpOnly/i);
      assert.match(header, /Path=\/api\/auth/);
      assert.match(header, /SameSite=Lax/i);
      assert.match(header, /Max-Age=600/);
      assert.equal(cookieFrom(a, 'nl_gnonce'), `nl_gnonce=${a.json.nonce}`);
      assert.ok(nonceRepository.nonces.has(hashNonce(a.json.nonce)));
      assert.ok(!nonceRepository.nonces.has(a.json.nonce), 'the nonce itself is not stored');
      assert.equal(a.headers['cache-control'], 'no-store');
    });
  });
});

describe('Google sign-in: success paths', () => {
  it('creates a new, verified, passwordless account and signs in with the existing JWT cookie', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { email: 'New.Person@Example.com', sub: 'sub-new', name: 'New Person' });
      assert.equal(res.status, 200);
      assert.equal(res.json.isNewUser, true, 'lets the app send new people to onboarding');
      assert.equal(res.json.user.email, 'new.person@example.com');
      assert.equal(res.json.user.name, 'New Person');
      assert.doesNotMatch(res.text, /googleId|sub-new|passwordHash/);
      const header = setCookieHeader(res, 'nl_token');
      assert.match(header, /HttpOnly/i);
      assert.match(header, /SameSite=Lax/i);
      const stored = [...userRepository.users.values()][0];
      assert.equal(stored.googleId, 'sub-new');
      assert.equal(stored.emailVerified, true);
      assert.ok(stored.emailVerifiedAt instanceof Date);
      assert.equal(stored.passwordHash, undefined);
      assert.deepEqual(stored.authProviders, ['google']);
      const payload = jwt.verify(cookieFrom(res, 'nl_token').split('=')[1], TEST_JWT_SECRET, { algorithms: ['HS256'] });
      assert.equal(payload.sub, res.json.user.id);
      assert.equal((await me(url, cookieFrom(res, 'nl_token'))).status, 200);
    });
  });

  it('signs an existing Google user back in (same account, no duplicate), even if their Google email changed', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const first = await googleSignIn(url, google, { sub: 'sub-1', email: 'first@example.com' });
      const again = await googleSignIn(url, google, { sub: 'sub-1', email: 'renamed@example.com' });
      assert.equal(again.status, 200);
      assert.equal(again.json.isNewUser, false);
      assert.equal(again.json.user.id, first.json.user.id);
      assert.equal(again.json.user.email, 'first@example.com', 'the stable Google id is the identity, not the email');
      assert.equal(userRepository.users.size, 1);
    });
  });

  it('safely links Google to an existing account whose email is VERIFIED, keeping its password and data', async () => {
    const { app, userRepository, google } = makeTestApp();
    const local = await addUser(userRepository, { emailVerified: true, authProviders: ['password'] });
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { sub: 'sub-link', email: 'asha@example.com' });
      assert.equal(res.status, 200);
      assert.equal(res.json.user.id, local.id, 'the same account, not a new one');
      assert.equal(userRepository.users.size, 1);
      const stored = userRepository.users.get(local.id);
      assert.equal(stored.googleId, 'sub-link');
      assert.ok(stored.authProviders.includes('google') && stored.authProviders.includes('password'));
      const password = await postJson(url, '/api/auth/login', { email: 'asha@example.com', password: 'LocalPassw0rd' });
      assert.equal(password.status, 200, 'the existing password still works');
    });
  });

  it('falls back to the email local-part for the name and trims long names', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      await googleSignIn(url, google, { sub: 's1', email: 'no.name@example.com', name: undefined });
      await googleSignIn(url, google, { sub: 's2', email: 'long@example.com', name: 'x'.repeat(200) });
      const names = [...userRepository.users.values()].map((u) => u.name);
      assert.ok(names.includes('no.name'));
      assert.ok(names.every((n) => n.length >= 2 && n.length <= 60));
    });
  });
});

describe('Google sign-in: linking to an account with an UNVERIFIED email', () => {
  it('does not link on Google sign-in alone: it emails a confirmation code and signs nobody in', async () => {
    const { app, userRepository, mailer, google } = makeTestApp();
    const local = await addUser(userRepository); // never verified, like accounts from before email codes
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' });
      assert.equal(res.status, 202);
      assert.equal(res.json.status, 'verification_required');
      assert.equal(res.json.email, 'asha@example.com');
      assert.equal(setCookieHeader(res, 'nl_token'), undefined, 'no session yet');
      assert.equal(userRepository.users.get(local.id).googleId, undefined, 'not linked yet');
      assert.equal(mailer.outbox.at(-1).purpose, 'link');
      assert.equal(mailer.outbox.at(-1).to, 'asha@example.com');
    });
  });

  it('a successful PASSWORD login does not link or verify anything (a password does not prove the inbox)', async () => {
    const { app, userRepository, google } = makeTestApp();
    const local = await addUser(userRepository);
    await withServer(app, async (url) => {
      await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' });
      const login = await postJson(url, '/api/auth/login', { email: 'asha@example.com', password: 'LocalPassw0rd' });
      assert.equal(login.status, 200);
      const stored = userRepository.users.get(local.id);
      assert.equal(stored.googleId, undefined);
      assert.equal(Boolean(stored.emailVerified), false);
    });
  });

  it('the correct emailed code links Google, verifies the email and signs in', async () => {
    const { app, userRepository, google } = makeTestApp();
    const local = await addUser(userRepository);
    await withServer(app, async (url) => {
      await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' });
      const res = await postJson(url, '/api/auth/google/link/verify', { email: 'asha@example.com', code: codeFor(url, 'asha@example.com', 'link') });
      assert.equal(res.status, 200);
      assert.equal(res.json.user.id, local.id);
      assert.match(setCookieHeader(res, 'nl_token'), /HttpOnly/i);
      const stored = userRepository.users.get(local.id);
      assert.equal(stored.googleId, 'sub-x');
      assert.equal(stored.emailVerified, true);
      // Afterwards, Google sign-in works directly.
      assert.equal((await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' })).status, 200);
    });
  });

  it('a wrong, reused or expired code never links; five wrong guesses destroy the code', async () => {
    const { app, userRepository, google, clock } = makeTestApp();
    const local = await addUser(userRepository);
    await withServer(app, async (url) => {
      await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' });
      const code = codeFor(url, 'asha@example.com', 'link');
      const bad = code === '000000' ? '000001' : '000000';
      const verify = (c) => postJson(url, '/api/auth/google/link/verify', { email: 'asha@example.com', code: c });
      for (let i = 0; i < 4; i += 1) assert.equal((await verify(bad)).json.error.code, 'OTP_INVALID');
      assert.equal((await verify(bad)).json.error.code, 'OTP_ATTEMPTS_EXCEEDED');
      assert.equal((await verify(code)).status, 400, 'destroyed');
      assert.equal(userRepository.users.get(local.id).googleId, undefined);

      clock.advance(2 * MINUTE);
      await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' });
      const fresh = codeFor(url, 'asha@example.com', 'link');
      clock.advance(6 * MINUTE);
      assert.equal((await verify(fresh)).status, 400, 'expired');
      assert.equal(userRepository.users.get(local.id).googleId, undefined);
    });
  });

  it('the Google identity comes from the server-held challenge: it cannot be swapped or redirected to another account', async () => {
    const { app, userRepository, google } = makeTestApp();
    const a = await addUser(userRepository, { email: 'a@example.com' });
    const b = await addUser(userRepository, { email: 'b@example.com' });
    await withServer(app, async (url) => {
      await googleSignIn(url, google, { sub: 'sub-a', email: 'a@example.com' });
      const codeA = codeFor(url, 'a@example.com', 'link');
      // A's code presented for B's email, with extra fields trying to inject another identity.
      const attack = await postJson(url, '/api/auth/google/link/verify', { email: 'b@example.com', code: codeA, googleId: 'sub-evil', userId: b.id });
      assert.equal(attack.status, 400);
      assert.equal(userRepository.users.get(b.id).googleId, undefined);
      const ok = await postJson(url, '/api/auth/google/link/verify', { email: 'a@example.com', code: codeA, googleId: 'sub-evil', userId: b.id });
      assert.equal(ok.status, 200);
      assert.equal(ok.json.user.id, a.id);
      assert.equal(userRepository.users.get(a.id).googleId, 'sub-a', 'the id from the verified token, not the one the browser sent');
    });
  });

  it('the link code cannot be used to log in as a different purpose', async () => {
    const { app, userRepository, google } = makeTestApp();
    await addUser(userRepository);
    await withServer(app, async (url) => {
      await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' });
      const code = codeFor(url, 'asha@example.com', 'link');
      assert.equal((await postJson(url, '/api/auth/otp/verify', { email: 'asha@example.com', code })).status, 400);
    });
  });

  it('can resend the link code after the cooldown, but not before', async () => {
    const { app, userRepository, google, clock, mailer } = makeTestApp();
    await addUser(userRepository);
    await withServer(app, async (url) => {
      await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' });
      const resend = () => postJson(url, '/api/auth/google/link/resend', { email: 'asha@example.com' });
      assert.equal((await resend()).json.error.code, 'OTP_COOLDOWN');
      clock.advance(61_000);
      assert.equal((await resend()).status, 202);
      assert.equal(mailer.sentTo('asha@example.com'), 2);
      assert.equal((await postJson(url, '/api/auth/google/link/verify', { email: 'asha@example.com', code: codeFor(url, 'asha@example.com', 'link') })).status, 200);
    });
  });

  it('answers 503 (not a link) when email codes are switched off', async () => {
    const { app, userRepository, google } = makeTestApp({ emailEnabled: false });
    const local = await addUser(userRepository);
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { sub: 'sub-x', email: 'asha@example.com' });
      assert.equal(res.status, 503);
      assert.equal(userRepository.users.get(local.id).googleId, undefined);
    });
  });
});

describe('Google sign-in: account conflicts', () => {
  it('refuses when the email belongs to an account already linked to a DIFFERENT Google account', async () => {
    const { app, userRepository, google } = makeTestApp();
    await addUser(userRepository, { emailVerified: true, googleId: 'sub-original' });
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { sub: 'sub-impostor', email: 'asha@example.com' });
      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, 'GOOGLE_ACCOUNT_CONFLICT');
      assert.equal(setCookieHeader(res, 'nl_token'), undefined);
      assert.equal(userRepository.users.size, 1);
    });
  });

  it('handles the database refusing a duplicate Google id as a conflict, not a crash', async () => {
    const { app, userRepository, google } = makeTestApp();
    await addUser(userRepository, { emailVerified: true });
    userRepository.linkGoogle = async () => { throw Object.assign(new Error('E11000'), { code: 11000 }); };
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { sub: 'sub-race', email: 'asha@example.com' });
      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, 'GOOGLE_ACCOUNT_CONFLICT');
    });
  });
});

describe('Google sign-in: token verification (the real google-auth-library)', () => {
  const noAccount = (repo) => assert.equal(repo.users.size, 0, 'no account was created');

  it('rejects garbage and structurally invalid credentials', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      for (const credential of ['not-a-jwt', 'a.b.c', 'x'.repeat(5000), '']) {
        const res = await googleSignIn(url, google, {}, { credential });
        assert.ok([400, 401].includes(res.status), `status ${res.status}`);
        assert.equal(setCookieHeader(res, 'nl_token'), undefined);
      }
      const missing = await postJson(url, '/api/auth/google', {}, { Cookie: 'nl_gnonce=abc' });
      assert.equal(missing.status, 400);
      noAccount(userRepository);
    });
  });

  it('rejects a token signed with someone else\'s key (forgery)', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, {}, { signWith: google.forgeryKey });
      assert.equal(res.status, 401);
      assert.equal(res.json.error.code, 'GOOGLE_TOKEN_INVALID');
      noAccount(userRepository);
    });
  });

  it('rejects an expired token', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 });
      assert.equal(res.status, 401);
      assert.equal(res.json.error.code, 'GOOGLE_TOKEN_INVALID');
      noAccount(userRepository);
    });
  });

  it('rejects a token issued for a different app (wrong audience)', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { aud: 'someone-elses-app.apps.googleusercontent.com' });
      assert.equal(res.status, 401);
      noAccount(userRepository);
    });
  });

  it('rejects a token from the wrong issuer, and accepts both of Google\'s real issuer spellings', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      assert.equal((await googleSignIn(url, google, { iss: 'https://evil.example.com' })).status, 401);
      noAccount(userRepository);
      assert.equal((await googleSignIn(url, google, { iss: 'accounts.google.com', sub: 'iss-1', email: 'one@example.com' })).status, 200);
      assert.equal((await googleSignIn(url, google, { iss: 'https://accounts.google.com', sub: 'iss-2', email: 'two@example.com' })).status, 200);
    });
  });

  it('rejects an unsigned ("alg": "none") token and an HS256 token signed with the public key', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const claims = { iss: 'https://accounts.google.com', aud: google.clientId, sub: 's', email: 'x@example.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 };
      const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.sig`;
      assert.equal((await googleSignIn(url, google, {}, { credential: unsigned })).status, 401);
      const hs = jwt.sign(claims, 'any-shared-secret-value-1234567890', { algorithm: 'HS256', keyid: 'test-kid' });
      assert.equal((await googleSignIn(url, google, {}, { credential: hs })).status, 401);
      noAccount(userRepository);
    });
  });

  it('rejects a Google account whose email is NOT verified (false, missing, or a string)', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      for (const email_verified of [false, undefined, 'true', 1]) {
        const res = await googleSignIn(url, google, { email_verified });
        assert.equal(res.status, 403, `email_verified=${String(email_verified)}`);
        assert.equal(res.json.error.code, 'GOOGLE_EMAIL_UNVERIFIED');
      }
      noAccount(userRepository);
    });
  });

  it('rejects a token with no email or no subject', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      assert.equal((await googleSignIn(url, google, { email: undefined })).status, 401);
      assert.equal((await googleSignIn(url, google, { sub: undefined })).status, 401);
      noAccount(userRepository);
    });
  });

  it('answers 401 without leaking details, and logs only a short reason', async () => {
    const logger = createCapturingLogger();
    const { app, google } = makeTestApp({ logger });
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, { aud: 'other.apps.googleusercontent.com' });
      assert.equal(res.json.error.message, 'Google sign-in could not be verified. Please try again.');
      assert.doesNotMatch(res.text, /audience|other\.apps/i);
    });
  });
});

describe('Google sign-in: nonce (replay protection)', () => {
  const noUser = (repo) => assert.equal(repo.users.size, 0);

  it('requires the nonce cookie', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, {}, { skipNonceCookie: true });
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'GOOGLE_NONCE_INVALID');
      noUser(userRepository);
    });
  });

  it('requires the token to contain the nonce, and the same one as the cookie', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      assert.equal((await googleSignIn(url, google, { nonce: undefined })).json.error.code, 'GOOGLE_NONCE_INVALID', 'token without a nonce claim');
      assert.equal((await googleSignIn(url, google, {}, { tokenNonce: 'a-different-nonce-value' })).json.error.code, 'GOOGLE_NONCE_INVALID', 'token nonce differs from the cookie');
      const other = await nonceRes(url);
      const res = await googleSignIn(url, google, {}, { tokenNonce: other.json.nonce });
      assert.equal(res.status, 400, 'a nonce from another browser session does not match this cookie');
      noUser(userRepository);
    });
  });

  it('rejects a made-up nonce that the server never issued', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google, {}, { tokenNonce: 'forged-nonce', cookie: 'nl_gnonce=forged-nonce' });
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'GOOGLE_NONCE_INVALID');
      noUser(userRepository);
    });
  });

  it('cannot be replayed: the same token and cookie work once, then fail', async () => {
    const { app, userRepository, google } = makeTestApp();
    await withServer(app, async (url) => {
      const n = await nonceRes(url);
      const cookie = cookieFrom(n, 'nl_gnonce');
      const credential = google.sign({ nonce: n.json.nonce });
      const first = await postJson(url, '/api/auth/google', { credential }, { Cookie: cookie });
      assert.equal(first.status, 200);
      const replay = await postJson(url, '/api/auth/google', { credential }, { Cookie: cookie });
      assert.equal(replay.status, 400);
      assert.equal(replay.json.error.code, 'GOOGLE_NONCE_INVALID');
      assert.equal(setCookieHeader(replay, 'nl_token'), undefined);
      assert.equal(userRepository.users.size, 1);
    });
  });

  it('expires after ten minutes', async () => {
    const { app, userRepository, google, clock } = makeTestApp();
    await withServer(app, async (url) => {
      const n = await nonceRes(url);
      clock.advance(10 * MINUTE + 1000);
      const res = await postJson(url, '/api/auth/google', { credential: google.sign({ nonce: n.json.nonce }) }, { Cookie: cookieFrom(n, 'nl_gnonce') });
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'GOOGLE_NONCE_INVALID');
      noUser(userRepository);
    });
  });

  it('the nonce cookie is cleared after every attempt, successful or not', async () => {
    const { app, google } = makeTestApp();
    await withServer(app, async (url) => {
      const ok = await googleSignIn(url, google);
      const bad = await googleSignIn(url, google, {}, { signWith: google.forgeryKey });
      for (const res of [ok, bad]) assert.match(setCookieHeader(res, 'nl_gnonce'), /nl_gnonce=;.*Expires=Thu, 01 Jan 1970/i);
    });
  });
});

describe('Google sign-in: configuration, CSRF and compatibility', () => {
  it('answers 503 when Google is not configured, and everything else still works', async () => {
    const { app, userRepository } = makeTestApp({ google: null });
    await addUser(userRepository);
    await withServer(app, async (url) => {
      assert.equal((await nonceRes(url)).status, 503);
      assert.equal((await postJson(url, '/api/auth/google', { credential: 'a.b.c' })).status, 503);
      assert.equal((await postJson(url, '/api/auth/login', { email: 'asha@example.com', password: 'LocalPassw0rd' })).status, 200);
    });
  });

  it('refuses a Google sign-in post from another origin (CSRF)', async () => {
    const { app, google } = makeTestApp();
    await withServer(app, async (url) => {
      const n = await nonceRes(url);
      const res = await postJson(url, '/api/auth/google', { credential: google.sign({ nonce: n.json.nonce }) }, { Cookie: cookieFrom(n, 'nl_gnonce'), Origin: 'https://evil.example' });
      assert.equal(res.status, 403);
    });
  });

  it('logout works for a Google session, and protected routes accept it', async () => {
    const { app, google } = makeTestApp();
    await withServer(app, async (url) => {
      const res = await googleSignIn(url, google);
      const cookie = cookieFrom(res, 'nl_token');
      assert.equal((await request(url, '/api/profile', { headers: { Cookie: cookie } })).status, 200);
      const out = await postJson(url, '/api/auth/logout', {}, { Cookie: cookie });
      assert.match(setCookieHeader(out, 'nl_token'), /Expires=Thu, 01 Jan 1970/i);
      assert.equal((await me(url)).status, 401);
    });
  });
});
