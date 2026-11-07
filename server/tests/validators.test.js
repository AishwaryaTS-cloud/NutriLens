import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateLogin, validateRegistration } from '../utils/validators.js';

const good = { name: 'Asha Rao', email: 'Asha@Example.com ', password: 'Passw0rdOK' };

describe('validateRegistration', () => {
  it('accepts valid input and normalises name and email', () => {
    const result = validateRegistration({ ...good, name: '  Asha   Rao ' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, { name: 'Asha Rao', email: 'asha@example.com', password: 'Passw0rdOK' });
  });

  it('reports every invalid field at once', () => {
    const result = validateRegistration({ name: 'A', email: 'nope', password: 'short' });
    assert.equal(result.valid, false);
    assert.deepEqual(Object.keys(result.errors).sort(), ['email', 'name', 'password']);
  });

  it('requires a letter and a number in the password', () => {
    assert.ok(validateRegistration({ ...good, password: 'onlyletters' }).errors.password);
    assert.ok(validateRegistration({ ...good, password: '1234567890' }).errors.password);
  });

  it('rejects passwords over 72 bytes (bcrypt would silently truncate them)', () => {
    assert.ok(validateRegistration({ ...good, password: `a1${'x'.repeat(71)}` }).errors.password);
    assert.equal(validateRegistration({ ...good, password: `a1${'x'.repeat(70)}` }).valid, true);
  });

  it('treats non-string and missing input as invalid instead of throwing', () => {
    assert.equal(validateRegistration(undefined).valid, false);
    assert.equal(validateRegistration({ name: 5, email: {}, password: ['x'] }).valid, false);
    assert.equal(validateRegistration({ ...good, email: { $gt: '' } }).valid, false);
  });
});

describe('validateLogin', () => {
  it('accepts an email and any non-empty password', () => {
    const result = validateLogin({ email: ' A@b.co ', password: 'whatever' });
    assert.equal(result.valid, true);
    assert.equal(result.value.email, 'a@b.co');
  });

  it('rejects missing fields and object-shaped emails (NoSQL injection attempt)', () => {
    assert.deepEqual(Object.keys(validateLogin({}).errors).sort(), ['email', 'password']);
    assert.equal(validateLogin({ email: { $ne: null }, password: 'x' }).valid, false);
  });
});
