import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authErrorMessage, backspaceCode, editCode, formatCountdown, isCompleteCode, sanitizeCode, secondsUntil } from './otp.js';

describe('sanitizeCode / isCompleteCode', () => {
  it('keeps only digits, at most six, so pasted codes with spaces or dashes work', () => {
    assert.equal(sanitizeCode('123 456'), '123456');
    assert.equal(sanitizeCode('12-34-56'), '123456');
    assert.equal(sanitizeCode('1234567890'), '123456');
    assert.equal(sanitizeCode('abc'), '');
    assert.equal(sanitizeCode(null), '');
    assert.equal(sanitizeCode(undefined), '');
  });
  it('is complete only with exactly six digits', () => {
    assert.equal(isCompleteCode('123456'), true);
    assert.equal(isCompleteCode('12345'), false);
    assert.equal(isCompleteCode('12345a'), false);
    assert.equal(isCompleteCode(''), false);
  });
});

describe('editCode (typing, pasting, autofill and deleting in the six boxes)', () => {
  it('typing a digit fills that box and moves focus to the next', () => {
    assert.deepEqual(editCode('', 0, '4'), { code: '4', focus: 1 });
    assert.deepEqual(editCode('41', 2, '7'), { code: '417', focus: 3 });
  });
  it('typing in the last box keeps focus there', () => {
    assert.deepEqual(editCode('12345', 5, '6'), { code: '123456', focus: 5 });
  });
  it('a whole code pasted or autofilled into any box fills all six', () => {
    assert.deepEqual(editCode('', 0, '123456'), { code: '123456', focus: 5 });
    assert.deepEqual(editCode('', 3, '123 456'), { code: '123456', focus: 5 }, 'even when the paste lands in a later box');
  });
  it('typing over an earlier box replaces that digit without losing the rest', () => {
    assert.deepEqual(editCode('123456', 1, '9'), { code: '193456', focus: 2 });
  });
  it('rejects non-digits', () => {
    assert.deepEqual(editCode('12', 2, 'x'), { code: '12', focus: 2 });
  });
  it('clearing a box removes just that digit', () => {
    assert.deepEqual(editCode('123456', 2, ''), { code: '12456', focus: 2 });
  });
});

describe('backspaceCode', () => {
  it('on an empty box deletes the previous digit and steps back', () => {
    assert.deepEqual(backspaceCode('123', 3), { code: '12', focus: 2 });
    assert.deepEqual(backspaceCode('123456', 3), { code: '12456', focus: 2 });
  });
  it('does nothing in the first box', () => {
    assert.deepEqual(backspaceCode('', 0), { code: '', focus: 0 });
  });
});

describe('countdown helpers', () => {
  it('secondsUntil rounds up and never goes negative', () => {
    assert.equal(secondsUntil(10_000, 0), 10);
    assert.equal(secondsUntil(10_001, 0), 11);
    assert.equal(secondsUntil(1_000, 5_000), 0);
  });
  it('formatCountdown shows minutes and zero-padded seconds', () => {
    assert.equal(formatCountdown(300), '5:00');
    assert.equal(formatCountdown(125), '2:05');
    assert.equal(formatCountdown(59), '0:59');
    assert.equal(formatCountdown(0), '0:00');
    assert.equal(formatCountdown(-4), '0:00');
  });
});

describe('authErrorMessage', () => {
  it('turns API error codes into friendly, specific messages', () => {
    assert.match(authErrorMessage({ code: 'OTP_INVALID' }), /incorrect or has expired/);
    assert.match(authErrorMessage({ code: 'OTP_ATTEMPTS_EXCEEDED' }), /Request a new code/);
    assert.match(authErrorMessage({ code: 'OTP_COOLDOWN', fieldErrors: { retryAfterSeconds: 42 } }), /42 seconds/);
    assert.match(authErrorMessage({ code: 'OTP_COOLDOWN', fieldErrors: {} }), /wait a moment/);
    assert.match(authErrorMessage({ code: 'EMAIL_SEND_FAILED' }), /couldn’t send/);
    assert.match(authErrorMessage({ code: 'EMAIL_UNAVAILABLE' }), /use your password/);
    assert.match(authErrorMessage({ code: 'GOOGLE_EMAIL_UNVERIFIED' }), /isn’t verified/);
    assert.match(authErrorMessage({ code: 'GOOGLE_ACCOUNT_CONFLICT' }), /different Google account/);
    assert.match(authErrorMessage({ code: 'RATE_LIMITED' }), /Too many attempts/);
  });
  it('falls back to the server message, then to a generic one', () => {
    assert.equal(authErrorMessage({ code: 'SOMETHING', message: 'Server said this' }), 'Server said this');
    assert.match(authErrorMessage({}), /Something went wrong/);
    assert.match(authErrorMessage(undefined), /Something went wrong/);
  });
});
