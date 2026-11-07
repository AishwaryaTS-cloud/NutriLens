import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasErrors, validateLoginForm, validateRegisterForm } from './authValidation.js';

const good = { name: 'Asha Rao', email: 'asha@example.com', password: 'Passw0rdOK', confirmPassword: 'Passw0rdOK' };

describe('validateRegisterForm', () => {
  it('accepts valid input', () => {
    assert.equal(hasErrors(validateRegisterForm(good)), false);
  });

  it('flags each invalid field', () => {
    const errors = validateRegisterForm({ name: 'A', email: 'nope', password: 'short', confirmPassword: 'other' });
    assert.deepEqual(Object.keys(errors).sort(), ['confirmPassword', 'email', 'name', 'password']);
  });

  it('enforces the same password rules as the server', () => {
    assert.ok(validateRegisterForm({ ...good, password: 'onlyletters', confirmPassword: 'onlyletters' }).password);
    assert.ok(validateRegisterForm({ ...good, password: '12345678', confirmPassword: '12345678' }).password);
    const long = `a1${'x'.repeat(71)}`;
    assert.ok(validateRegisterForm({ ...good, password: long, confirmPassword: long }).password);
  });

  it('requires the confirmation to match', () => {
    assert.ok(validateRegisterForm({ ...good, confirmPassword: 'Different1' }).confirmPassword);
  });
});

describe('validateLoginForm', () => {
  it('needs a valid email and a password', () => {
    assert.equal(hasErrors(validateLoginForm({ email: 'a@b.co', password: 'x' })), false);
    assert.deepEqual(Object.keys(validateLoginForm({})).sort(), ['email', 'password']);
  });
});
