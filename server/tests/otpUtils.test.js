import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateNonce, generateOtp, hashNonce, hashOtp, safeEqual } from '../utils/otp.js';

const SECRET = 'a-test-secret-that-is-at-least-32-characters';

describe('generateOtp', () => {
  it('always produces exactly six digits, including leading zeros', () => {
    const codes = Array.from({ length: 3000 }, generateOtp);
    assert.ok(codes.every((c) => /^\d{6}$/.test(c)));
    assert.ok(codes.some((c) => c.startsWith('0')), 'leading zeros are kept (about 1 in 10 codes)');
  });

  it('is random, not a counter or a constant', () => {
    assert.ok(new Set(Array.from({ length: 500 }, generateOtp)).size > 450);
  });

  it('spreads across the whole range (no obvious bias in the first digit)', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 20000; i += 1) counts[Number(generateOtp()[0])] += 1;
    for (const n of counts) assert.ok(n > 1600 && n < 2400, `first-digit count ${n} is far from 2000`);
  });
});

describe('hashOtp', () => {
  const base = { secret: SECRET, email: 'a@example.com', purpose: 'login', code: '123456' };

  it('is a 64-character HMAC-SHA-256 hex digest and never contains the code', () => {
    const hash = hashOtp(base);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(!hash.includes('123456'));
    assert.equal(hashOtp(base), hash, 'deterministic for the same input');
  });

  it('depends on the secret: without OTP_SECRET a leaked hash cannot be brute-forced', () => {
    assert.notEqual(hashOtp(base), hashOtp({ ...base, secret: 'another-secret-that-is-at-least-32-chars!' }));
  });

  it('is bound to the email and the purpose, so a code cannot be moved to another challenge', () => {
    assert.notEqual(hashOtp(base), hashOtp({ ...base, email: 'b@example.com' }));
    assert.notEqual(hashOtp(base), hashOtp({ ...base, purpose: 'register' }));
    assert.notEqual(hashOtp(base), hashOtp({ ...base, code: '123457' }));
  });
});

describe('safeEqual and nonces', () => {
  it('compares equal and unequal values, including different lengths, without throwing', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
    assert.equal(safeEqual('', ''), true);
  });

  it('nonces are long, URL-safe and unique; only their SHA-256 is meant to be stored', () => {
    const a = generateNonce();
    assert.match(a, /^[\w-]{43}$/);
    assert.notEqual(a, generateNonce());
    assert.match(hashNonce(a), /^[0-9a-f]{64}$/);
    assert.notEqual(hashNonce(a), a);
  });
});
