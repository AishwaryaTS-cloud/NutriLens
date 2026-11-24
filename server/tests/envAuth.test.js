import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnvValidationError, parseEnv } from '../config/env.js';

const base = { MONGODB_URI: 'mongodb://localhost/test', JWT_SECRET: 'x'.repeat(40) };
const issues = (extra) => { try { parseEnv({ ...base, ...extra }); return []; } catch (e) { assert.ok(e instanceof EnvValidationError); return e.issues; } };
const OTP_SECRET = 'o'.repeat(40);

describe('parseEnv: email delivery', () => {
  it('leaves email codes off when EMAIL_PROVIDER is empty (existing deployments keep working)', () => {
    const env = parseEnv(base);
    assert.equal(env.email, null);
    assert.equal(env.otpSecret, undefined);
    assert.equal(env.googleClientId, undefined);
    assert.equal(env.trustProxy, false);
  });

  it('accepts gmail with an App Password, ignoring the spaces Google shows in it', () => {
    const env = parseEnv({ ...base, EMAIL_PROVIDER: 'gmail', EMAIL_FROM: 'me@gmail.com', SMTP_USER: 'me@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop', OTP_SECRET });
    assert.equal(env.email.provider, 'gmail');
    assert.equal(env.email.smtp.pass, 'abcdefghijklmnop');
    assert.equal(env.email.smtp.host, 'smtp.gmail.com');
    assert.equal(env.email.smtp.port, 465);
  });

  it('accepts brevo with an API key', () => {
    const env = parseEnv({ ...base, EMAIL_PROVIDER: 'brevo', EMAIL_FROM: 'sender@example.com', BREVO_API_KEY: 'xkeysib-abc', OTP_SECRET });
    assert.equal(env.email.provider, 'brevo');
    assert.equal(env.email.brevoApiKey, 'xkeysib-abc');
    assert.equal(env.email.fromName, 'NutriLens');
  });

  it('requires the provider credentials, a sender address and OTP_SECRET', () => {
    assert.ok(issues({ EMAIL_PROVIDER: 'gmail', EMAIL_FROM: 'me@gmail.com', OTP_SECRET }).some((m) => m.startsWith('SMTP_USER')));
    assert.ok(issues({ EMAIL_PROVIDER: 'gmail', EMAIL_FROM: 'me@gmail.com', SMTP_USER: 'u', OTP_SECRET }).some((m) => m.startsWith('SMTP_PASS')));
    assert.ok(issues({ EMAIL_PROVIDER: 'brevo', EMAIL_FROM: 'a@b.co', OTP_SECRET }).some((m) => m.startsWith('BREVO_API_KEY')));
    assert.ok(issues({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k', OTP_SECRET }).some((m) => m.startsWith('EMAIL_FROM')));
    assert.ok(issues({ EMAIL_PROVIDER: 'brevo', EMAIL_FROM: 'a@b.co', BREVO_API_KEY: 'k' }).some((m) => m.startsWith('OTP_SECRET')));
  });

  it('rejects an unknown provider and weak or placeholder OTP secrets', () => {
    assert.ok(issues({ EMAIL_PROVIDER: 'sendgrid' }).some((m) => m.startsWith('EMAIL_PROVIDER')));
    assert.ok(issues({ OTP_SECRET: 'short' }).some((m) => m.startsWith('OTP_SECRET')));
    assert.ok(issues({ OTP_SECRET: 'replace-with-a-long-random-value-0123456789' }).some((m) => m.startsWith('OTP_SECRET')));
  });

  it('never echoes a secret value in an error message', () => {
    const all = issues({ EMAIL_PROVIDER: 'gmail', EMAIL_FROM: 'bad', SMTP_PASS: 'super-secret-pass', OTP_SECRET: 'short-secret-value' }).join('\n');
    assert.doesNotMatch(all, /super-secret-pass|short-secret-value/);
  });
});

describe('parseEnv: Google and TRUST_PROXY', () => {
  it('accepts a Google client id and rejects a malformed one', () => {
    assert.equal(parseEnv({ ...base, GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com' }).googleClientId, '123-abc.apps.googleusercontent.com');
    assert.ok(issues({ GOOGLE_CLIENT_ID: 'not-a-client-id' }).some((m) => m.startsWith('GOOGLE_CLIENT_ID')));
  });

  it('TRUST_PROXY: off by default, a hop count for Render, or specific addresses', () => {
    assert.equal(parseEnv({ ...base, TRUST_PROXY: '' }).trustProxy, false);
    assert.equal(parseEnv({ ...base, TRUST_PROXY: '0' }).trustProxy, false);
    assert.equal(parseEnv({ ...base, TRUST_PROXY: '1' }).trustProxy, 1);
    assert.equal(parseEnv({ ...base, TRUST_PROXY: 'loopback, 10.0.0.0/8' }).trustProxy, 'loopback,10.0.0.0/8');
  });

  it('TRUST_PROXY refuses "true" (it would trust forged X-Forwarded-For) and nonsense', () => {
    assert.ok(issues({ TRUST_PROXY: 'true' }).some((m) => /forged/.test(m)));
    assert.ok(issues({ TRUST_PROXY: '99' }).some((m) => m.startsWith('TRUST_PROXY')));
    assert.ok(issues({ TRUST_PROXY: 'banana' }).some((m) => m.startsWith('TRUST_PROXY')));
  });
});
