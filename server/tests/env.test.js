import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnvValidationError, parseEnv } from '../config/env.js';

const SECRET = 'a-long-random-secret-for-tests-0123456789';
const valid = { MONGODB_URI: 'mongodb://127.0.0.1:27018/nutrilens', JWT_SECRET: SECRET };

function catchError(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe('parseEnv (Phase 0 behaviour)', () => {
  it('applies safe defaults', () => {
    const env = parseEnv(valid);
    assert.equal(env.nodeEnv, 'development');
    assert.equal(env.port, 4000);
    assert.equal(env.clientOrigin, 'http://localhost:5173');
  });

  it('requires MONGODB_URI', () => {
    assert.ok(catchError(() => parseEnv({ JWT_SECRET: SECRET })) instanceof EnvValidationError);
  });

  it('rejects a non-MongoDB URI without echoing its contents', () => {
    const error = catchError(() =>
      parseEnv({ ...valid, MONGODB_URI: 'postgres://admin:hunter2@db.example.com/app' }),
    );
    assert.ok(error instanceof EnvValidationError);
    assert.match(error.message, /MONGODB_URI/);
    assert.doesNotMatch(error.message, /hunter2/);
  });

  it('rejects an out-of-range PORT', () => {
    assert.ok(catchError(() => parseEnv({ ...valid, PORT: '70000' })) instanceof EnvValidationError);
  });

  it('rejects an invalid CLIENT_ORIGIN and an unknown NODE_ENV', () => {
    assert.ok(catchError(() => parseEnv({ ...valid, CLIENT_ORIGIN: 'not a url' })) instanceof EnvValidationError);
    assert.ok(catchError(() => parseEnv({ ...valid, NODE_ENV: 'staging' })) instanceof EnvValidationError);
  });

  it('normalises CLIENT_ORIGIN so CORS matches exactly', () => {
    const env = parseEnv({ ...valid, CLIENT_ORIGIN: 'https://app.example.com/' });
    assert.equal(env.clientOrigin, 'https://app.example.com');
  });
});

describe('parseEnv (authentication settings)', () => {
  it('requires a JWT_SECRET of at least 32 characters', () => {
    assert.ok(catchError(() => parseEnv({ MONGODB_URI: valid.MONGODB_URI })) instanceof EnvValidationError);
    assert.ok(catchError(() => parseEnv({ ...valid, JWT_SECRET: 'too-short' })) instanceof EnvValidationError);
  });

  it('never echoes the secret in an error message', () => {
    const short = 'hunter2-secret';
    const error = catchError(() => parseEnv({ ...valid, JWT_SECRET: short }));
    assert.doesNotMatch(error.message, /hunter2/);
  });

  it('rejects the .env.example placeholder', () => {
    const placeholder = 'replace-with-at-least-32-random-characters';
    assert.ok(catchError(() => parseEnv({ ...valid, JWT_SECRET: placeholder })) instanceof EnvValidationError);
  });

  it('defaults to a 7 day token and a lax, HTTP-only-friendly cookie', () => {
    const env = parseEnv(valid);
    assert.equal(env.jwtExpiresInSeconds, 7 * 86400);
    assert.equal(env.cookieSameSite, 'lax');
    assert.equal(env.cookieSecure, false);
  });

  it('makes the cookie Secure by default in production', () => {
    assert.equal(parseEnv({ ...valid, NODE_ENV: 'production' }).cookieSecure, true);
  });

  it('parses JWT_EXPIRES_IN in minutes, hours and days and rejects other formats', () => {
    assert.equal(parseEnv({ ...valid, JWT_EXPIRES_IN: '30m' }).jwtExpiresInSeconds, 1800);
    assert.equal(parseEnv({ ...valid, JWT_EXPIRES_IN: '12h' }).jwtExpiresInSeconds, 43200);
    assert.ok(catchError(() => parseEnv({ ...valid, JWT_EXPIRES_IN: 'forever' })) instanceof EnvValidationError);
    assert.ok(catchError(() => parseEnv({ ...valid, JWT_EXPIRES_IN: '0d' })) instanceof EnvValidationError);
  });

  it('refuses SameSite=None without Secure, and unknown SameSite values', () => {
    assert.ok(
      catchError(() => parseEnv({ ...valid, COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' })) instanceof
        EnvValidationError,
    );
    assert.equal(parseEnv({ ...valid, COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'true' }).cookieSameSite, 'none');
    assert.ok(catchError(() => parseEnv({ ...valid, COOKIE_SAME_SITE: 'sometimes' })) instanceof EnvValidationError);
  });
});

describe('parseEnv (upload and Gemini settings)', () => {
  it('defaults to a 5 MB upload limit, a 45 second Gemini timeout and no API key', () => {
    const env = parseEnv(valid);
    assert.equal(env.maxUploadBytes, 5 * 1024 * 1024);
    assert.equal(env.geminiTimeoutMs, 45000);
    assert.equal(env.geminiModel, 'gemini-2.5-flash');
    assert.equal(env.geminiApiKey, undefined);
    assert.equal(env.geminiDailyLimit, 0);
  });

  it('accepts configured upload, Gemini model, key, timeout and daily limit', () => {
    const env = parseEnv({ ...valid, MAX_UPLOAD_MB: '8', GEMINI_TIMEOUT_MS: '90000', GEMINI_MODEL: 'gemini-2.5-flash-lite', GEMINI_API_KEY: 'AIza-test-key-0123456789', GEMINI_DAILY_LIMIT: '50' });
    assert.equal(env.maxUploadBytes, 8 * 1024 * 1024);
    assert.equal(env.geminiTimeoutMs, 90000);
    assert.equal(env.geminiModel, 'gemini-2.5-flash-lite');
    assert.equal(env.geminiApiKey, 'AIza-test-key-0123456789');
    assert.equal(env.geminiDailyLimit, 50);
  });

  it('rejects invalid values without echoing the API key', () => {
    for (const MAX_UPLOAD_MB of ['0', '11', 'big']) {
      assert.ok(catchError(() => parseEnv({ ...valid, MAX_UPLOAD_MB })) instanceof EnvValidationError, MAX_UPLOAD_MB);
    }
    for (const GEMINI_TIMEOUT_MS of ['100', '500000', 'soon']) {
      assert.ok(catchError(() => parseEnv({ ...valid, GEMINI_TIMEOUT_MS })) instanceof EnvValidationError, GEMINI_TIMEOUT_MS);
    }
    assert.ok(catchError(() => parseEnv({ ...valid, GEMINI_MODEL: 'Bad Model!' })) instanceof EnvValidationError);
    const bad = catchError(() => parseEnv({ ...valid, GEMINI_API_KEY: 'has spaces in it !!' }));
    assert.ok(bad instanceof EnvValidationError);
    assert.doesNotMatch(bad.message, /has spaces/);
  });
});
