import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  TEST_JWT_SECRET,
  TEST_ORIGIN,
  cookieFrom,
  makeTestApp,
  postJson,
  request,
  setCookieHeader,
  validUser,
  withServer,
} from './helpers.js';

const register = (url, body = validUser, headers) => postJson(url, '/api/auth/register', body, headers);
const login = (url, body, headers) => postJson(url, '/api/auth/login', body, headers);
const me = (url, cookie) => request(url, '/api/auth/me', { headers: cookie ? { Cookie: cookie } : {} });

describe('POST /api/auth/register', () => {
  it('creates an account, returns the public user and sets an HTTP-only cookie', () =>
    withServer(makeTestApp().app, async (url) => {
      const res = await register(url);
      assert.equal(res.status, 201);
      assert.equal(res.json.user.email, 'asha@example.com');
      assert.equal(res.json.user.name, 'Asha Rao');
      assert.ok(res.json.user.id);

      const header = setCookieHeader(res, 'nl_token');
      assert.ok(header, 'auth cookie is set');
      assert.match(header, /HttpOnly/i);
      assert.match(header, /SameSite=Lax/i);
      assert.match(header, /Path=\//i);
      assert.equal(res.headers['cache-control'], 'no-store');
    }));

  it('never returns the password or its hash', () =>
    withServer(makeTestApp().app, async (url) => {
      const res = await register(url);
      assert.doesNotMatch(res.text, /password/i);
      assert.doesNotMatch(res.text, /\$2[aby]\$/);
    }));

  it('stores only a bcrypt hash, never the plain-text password', async () => {
    const { app, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      await register(url);
    });
    const stored = [...userRepository.users.values()][0];
    assert.notEqual(stored.passwordHash, validUser.password);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare(validUser.password, stored.passwordHash), true);
    assert.equal(await bcrypt.compare('not the password', stored.passwordHash), false);
  });

  it('signs a JWT whose subject is the new user id', () =>
    withServer(makeTestApp().app, async (url) => {
      const res = await register(url);
      const token = cookieFrom(res, 'nl_token').split('=')[1];
      const payload = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] });
      assert.equal(payload.sub, res.json.user.id);
      assert.ok(payload.exp > payload.iat);
    }));

  it('marks the cookie Secure when configured to', () =>
    withServer(makeTestApp({ cookie: { secure: true, sameSite: 'none' } }).app, async (url) => {
      const header = setCookieHeader(await register(url), 'nl_token');
      assert.match(header, /; Secure/i);
      assert.match(header, /SameSite=None/i);
    }));

  it('rejects a duplicate email, ignoring letter case', () =>
    withServer(makeTestApp().app, async (url) => {
      assert.equal((await register(url)).status, 201);
      const again = await register(url, { ...validUser, name: 'Someone Else', email: 'ASHA@Example.COM' });
      assert.equal(again.status, 409);
      assert.equal(again.json.error.code, 'EMAIL_TAKEN');
      assert.equal(setCookieHeader(again, 'nl_token'), undefined);
    }));

  it('turns a database duplicate-key race into the same 409', async () => {
    const { app, userRepository } = makeTestApp();
    // Simulates two simultaneous sign-ups: the pre-check passes, the unique index then rejects.
    userRepository.findByEmail = async () => null;
    userRepository.create = async () => {
      throw Object.assign(new Error('E11000'), { code: 11000 });
    };
    await withServer(app, async (url) => {
      const res = await register(url);
      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, 'EMAIL_TAKEN');
    });
  });

  it('returns field-level validation errors', () =>
    withServer(makeTestApp().app, async (url) => {
      const res = await register(url, { name: '', email: 'bad', password: '123' });
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'VALIDATION_ERROR');
      assert.deepEqual(Object.keys(res.json.error.details).sort(), ['email', 'name', 'password']);
    }));
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and sets the cookie', () =>
    withServer(makeTestApp().app, async (url) => {
      await register(url);
      const res = await login(url, { email: 'ASHA@example.com', password: validUser.password });
      assert.equal(res.status, 200);
      assert.equal(res.json.user.email, 'asha@example.com');
      assert.match(setCookieHeader(res, 'nl_token'), /HttpOnly/i);
    }));

  it('rejects a wrong password and an unknown email with the same generic error', () =>
    withServer(makeTestApp().app, async (url) => {
      await register(url);
      const wrongPassword = await login(url, { email: validUser.email, password: 'WrongPass123' });
      const unknownEmail = await login(url, { email: 'nobody@example.com', password: validUser.password });
      for (const res of [wrongPassword, unknownEmail]) {
        assert.equal(res.status, 401);
        assert.equal(res.json.error.code, 'INVALID_CREDENTIALS');
        assert.equal(setCookieHeader(res, 'nl_token'), undefined);
      }
      assert.equal(wrongPassword.json.error.message, unknownEmail.json.error.message);
    }));

  it('returns validation errors for missing fields', () =>
    withServer(makeTestApp().app, async (url) => {
      const res = await login(url, {});
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'VALIDATION_ERROR');
    }));
});

describe('GET /api/auth/me (protected route)', () => {
  it('returns the current user for a valid cookie', () =>
    withServer(makeTestApp().app, async (url) => {
      const signUp = await register(url);
      const res = await me(url, cookieFrom(signUp, 'nl_token'));
      assert.equal(res.status, 200);
      assert.equal(res.json.user.email, validUser.email);
      assert.doesNotMatch(res.text, /passwordHash|\$2[aby]\$/);
    }));

  it('rejects unauthenticated access', () =>
    withServer(makeTestApp().app, async (url) => {
      const res = await me(url);
      assert.equal(res.status, 401);
      assert.equal(res.json.error.code, 'UNAUTHENTICATED');
    }));

  it('rejects a tampered token, a token signed with another secret, and an expired token', () =>
    withServer(makeTestApp().app, async (url) => {
      const signUp = await register(url);
      const good = cookieFrom(signUp, 'nl_token');
      const userId = signUp.json.user.id;

      const tampered = `${good.slice(0, -2)}xx`;
      const foreign = `nl_token=${jwt.sign({}, 'a-completely-different-secret-value-0000', { subject: userId })}`;
      const expired = `nl_token=${jwt.sign({ exp: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET, { subject: userId })}`;
      const unsigned = `nl_token=${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(`{"sub":"${userId}"}`).toString('base64url')}.`;

      for (const cookie of [tampered, foreign, expired, unsigned]) {
        const res = await me(url, cookie);
        assert.equal(res.status, 401, `expected 401 for ${cookie.slice(0, 24)}...`);
      }
    }));

  it('rejects a valid token whose user no longer exists', async () => {
    const { app, userRepository } = makeTestApp();
    await withServer(app, async (url) => {
      const signUp = await register(url);
      userRepository.users.clear();
      assert.equal((await me(url, cookieFrom(signUp, 'nl_token'))).status, 401);
    });
  });
});

describe('POST /api/auth/logout', () => {
  it('expires the auth cookie, after which /me is unauthenticated', () =>
    withServer(makeTestApp().app, async (url) => {
      const signUp = await register(url);
      const cookie = cookieFrom(signUp, 'nl_token');
      assert.equal((await me(url, cookie)).status, 200);

      const res = await postJson(url, '/api/auth/logout', {}, { Cookie: cookie });
      assert.equal(res.status, 200);
      const header = setCookieHeader(res, 'nl_token');
      assert.match(header, /nl_token=;/);
      assert.match(header, /Expires=Thu, 01 Jan 1970/i);
      assert.match(header, /HttpOnly/i);

      // A browser drops the expired cookie, so the next request carries none.
      assert.equal((await me(url)).status, 401);
    }));

  it('is safe to call when not logged in', () =>
    withServer(makeTestApp().app, async (url) => {
      assert.equal((await postJson(url, '/api/auth/logout', {})).status, 200);
    }));
});

describe('request protections', () => {
  it('refuses state-changing requests from another origin (CSRF) but allows the client origin', () =>
    withServer(makeTestApp().app, async (url) => {
      const evil = await register(url, validUser, { Origin: 'https://evil.example' });
      assert.equal(evil.status, 403);
      assert.equal(evil.json.error.code, 'FORBIDDEN_ORIGIN');

      const ok = await register(url, validUser, { Origin: TEST_ORIGIN });
      assert.equal(ok.status, 201);
      assert.equal(ok.headers['access-control-allow-credentials'], 'true');
      assert.equal(ok.headers['access-control-allow-origin'], TEST_ORIGIN);
    }));

  it('limits repeated attempts with 429', () =>
    withServer(makeTestApp({ authRateLimit: { windowMs: 60_000, max: 2 } }).app, async (url) => {
      const bad = { email: validUser.email, password: 'WrongPass123' };
      assert.equal((await login(url, bad)).status, 401);
      assert.equal((await login(url, bad)).status, 401);
      const limited = await login(url, bad);
      assert.equal(limited.status, 429);
      assert.equal(limited.json.error.code, 'RATE_LIMITED');
    }));

  it('keeps the Phase 0 health endpoint working', () =>
    withServer(makeTestApp().app, async (url) => {
      const res = await request(url, '/api/v1/health');
      assert.equal(res.status, 200);
      assert.equal(res.json.status, 'ok');
    }));
});
