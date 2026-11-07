import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRateLimiter } from '../middleware/rateLimit.js';

function run(limiter, ip) {
  let outcome;
  limiter({ ip }, {}, (err) => {
    outcome = err;
  });
  return outcome;
}

describe('createRateLimiter', () => {
  it('allows up to max attempts, then answers 429 for that client only', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    assert.equal(run(limiter, '1.1.1.1'), undefined);
    assert.equal(run(limiter, '1.1.1.1'), undefined);
    const blocked = run(limiter, '1.1.1.1');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.code, 'RATE_LIMITED');
    assert.equal(run(limiter, '2.2.2.2'), undefined);
  });

  it('starts a fresh window once the old one has expired', async () => {
    const limiter = createRateLimiter({ windowMs: 20, max: 1 });
    assert.equal(run(limiter, '3.3.3.3'), undefined);
    assert.equal(run(limiter, '3.3.3.3').status, 429);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(run(limiter, '3.3.3.3'), undefined);
  });
});
