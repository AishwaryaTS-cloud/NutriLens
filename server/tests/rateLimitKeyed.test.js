import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRateLimiter, emailKey } from '../middleware/rateLimit.js';

function run(limiter, req) {
  let outcome; const headers = {};
  limiter(req, { set: (k, v) => { headers[k] = v; } }, (err) => { outcome = err; });
  return { outcome, headers };
}

describe('createRateLimiter with a custom key', () => {
  it('counts per key (email), not per IP, and reports how long to wait', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, key: emailKey, code: 'OTP_COOLDOWN', message: 'wait' });
    const first = run(limiter, { ip: '1.1.1.1', body: { email: 'A@x.com ' } });
    assert.equal(first.outcome, undefined);
    const second = run(limiter, { ip: '2.2.2.2', body: { email: 'a@x.com' } }); // different IP, same email
    assert.equal(second.outcome.status, 429);
    assert.equal(second.outcome.code, 'OTP_COOLDOWN');
    assert.ok(second.outcome.details.retryAfterSeconds >= 1 && second.outcome.details.retryAfterSeconds <= 60);
    assert.equal(second.headers['Retry-After'], String(second.outcome.details.retryAfterSeconds));
    assert.equal(run(limiter, { ip: '1.1.1.1', body: { email: 'b@x.com' } }).outcome, undefined);
  });

  it('emailKey normalises case and whitespace and copes with a missing body', () => {
    assert.equal(emailKey({ body: { email: '  Mixed@Case.COM ' } }), 'email:mixed@case.com');
    assert.equal(emailKey({}), 'email:');
    assert.equal(emailKey({ body: { email: 42 } }), 'email:42');
  });

  it('keeps the original per-IP behaviour and error code when no key is given', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    assert.equal(run(limiter, { ip: '9.9.9.9' }).outcome, undefined);
    assert.equal(run(limiter, { ip: '9.9.9.9' }).outcome.code, 'RATE_LIMITED');
  });
});
