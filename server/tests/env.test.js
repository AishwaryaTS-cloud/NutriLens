import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnvValidationError, parseEnv } from '../config/env.js';

const valid = { MONGODB_URI: 'mongodb://127.0.0.1:27017/nutrilens' };

function catchError(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe('parseEnv', () => {
  it('applies safe defaults', () => {
    const env = parseEnv(valid);
    assert.equal(env.nodeEnv, 'development');
    assert.equal(env.port, 4000);
    assert.equal(env.clientOrigin, 'http://localhost:5173');
  });

  it('requires MONGODB_URI', () => {
    assert.ok(catchError(() => parseEnv({})) instanceof EnvValidationError);
  });

  it('rejects a non-MongoDB URI without echoing its contents', () => {
    const error = catchError(() =>
      parseEnv({ MONGODB_URI: 'postgres://admin:hunter2@db.example.com/app' }),
    );
    assert.ok(error instanceof EnvValidationError);
    assert.match(error.message, /MONGODB_URI/);
    assert.doesNotMatch(error.message, /hunter2/);
  });

  it('rejects an out-of-range PORT', () => {
    assert.ok(catchError(() => parseEnv({ ...valid, PORT: '70000' })) instanceof EnvValidationError);
  });

  it('rejects an invalid CLIENT_ORIGIN and an unknown NODE_ENV', () => {
    assert.ok(
      catchError(() => parseEnv({ ...valid, CLIENT_ORIGIN: 'not a url' })) instanceof EnvValidationError,
    );
    assert.ok(catchError(() => parseEnv({ ...valid, NODE_ENV: 'staging' })) instanceof EnvValidationError);
  });

  it('normalises CLIENT_ORIGIN so CORS matches exactly', () => {
    const env = parseEnv({ ...valid, CLIENT_ORIGIN: 'https://app.example.com/' });
    assert.equal(env.clientOrigin, 'https://app.example.com');
  });
});
