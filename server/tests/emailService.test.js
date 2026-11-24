import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import nodemailer from 'nodemailer';
import { createEmailService } from '../services/emailService.js';
import { createBrevoTransport } from '../services/mail/brevoTransport.js';
import { createGmailTransport } from '../services/mail/gmailTransport.js';
import { renderOtpEmail } from '../services/mail/templates.js';
import { createCapturingLogger } from './helpers.js';

const from = { email: 'nutrilens.sender@example.com', name: 'NutriLens' };
const message = { from, to: 'asha@example.com', subject: 'Subject', text: 'text body', html: '<p>html</p>' };

describe('OTP email template', () => {
  for (const purpose of ['register', 'login', 'link']) {
    it(`${purpose}: has branding, the code, the 5-minute expiry and a do-not-share warning`, () => {
      const { subject, text, html } = renderOtpEmail({ code: '042913', purpose });
      assert.match(subject, /NutriLens|Confirm your email/);
      for (const body of [text, html]) {
        assert.match(body, /NutriLens/);
        assert.match(body, /042913/);
        assert.match(body, /5 minutes/);
        assert.match(body, /never share|Never share/i);
      }
    });
  }

  it('contains no personal information: no name, no address, no links', () => {
    // The template only ever receives the code and the purpose, so there is nothing personal to leak.
    const { text, html } = renderOtpEmail({ code: '111111', purpose: 'register', name: 'Asha', email: 'asha@example.com' });
    assert.doesNotMatch(text + html, /@|Asha|https?:/);
  });
});

describe('Brevo transport (HTTPS API)', () => {
  it('posts to the Brevo API over HTTPS with the key in a header, never in the URL or body', async () => {
    let seen;
    const transport = createBrevoTransport({ apiKey: 'xkeysib-secret-value', fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 201 }; } });
    await transport.send(message);
    assert.equal(seen.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers['api-key'], 'xkeysib-secret-value');
    assert.doesNotMatch(seen.url + seen.init.body, /xkeysib-secret-value/);
    const body = JSON.parse(seen.init.body);
    assert.deepEqual(body.sender, { name: 'NutriLens', email: from.email });
    assert.deepEqual(body.to, [{ email: 'asha@example.com' }]);
    assert.equal(body.htmlContent, '<p>html</p>');
    assert.equal(body.textContent, 'text body');
  });

  it('turns an HTTP error into a MailError that carries only the status', async () => {
    const transport = createBrevoTransport({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'Key not found: xkeysib-secret' }) });
    await assert.rejects(transport.send(message), (err) => err.reason === 'brevo_http:401' && !String(err.message).includes('xkeysib'));
  });

  it('turns a network failure and a timeout into MailErrors', async () => {
    const down = createBrevoTransport({ apiKey: 'k', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    await assert.rejects(down.send(message), (err) => err.reason === 'network:unreachable');
    const slow = createBrevoTransport({ apiKey: 'k', fetchImpl: async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); } });
    await assert.rejects(slow.send(message), (err) => err.reason === 'network:timeout');
  });
});

describe('Gmail transport (SMTP via Nodemailer)', () => {
  it('builds a correct message (nodemailer JSON transport, no network)', async () => {
    const captured = [];
    const fake = nodemailer.createTransport({ jsonTransport: true });
    const transport = createGmailTransport({ user: 'u', pass: 'p', nodemailerTransport: { sendMail: async (m) => { captured.push(m); return fake.sendMail(m); } } });
    await transport.send(message);
    assert.deepEqual(captured[0].from, { name: 'NutriLens', address: from.email });
    assert.equal(captured[0].to, 'asha@example.com');
    assert.equal(captured[0].text, 'text body');
    assert.equal(captured[0].html, '<p>html</p>');
  });

  it('wraps SMTP errors without leaking the server reply', async () => {
    const transport = createGmailTransport({ user: 'u', pass: 'p', nodemailerTransport: { sendMail: async () => { throw Object.assign(new Error('535 5.7.8 bad credentials for asha@example.com'), { responseCode: 535 }); } } });
    await assert.rejects(transport.send(message), (err) => err.reason === 'smtp:535' && !err.message.includes('asha@'));
  });

  it('is configured for Gmail by default: TLS on port 465 with the account credentials', () => {
    let options;
    const original = nodemailer.createTransport;
    nodemailer.createTransport = (o) => { options = o; return { sendMail: async () => ({}) }; };
    try {
      createGmailTransport({ user: 'me@gmail.com', pass: 'apppassword' });
    } finally {
      nodemailer.createTransport = original;
    }
    assert.equal(options.host, 'smtp.gmail.com');
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.deepEqual(options.auth, { user: 'me@gmail.com', pass: 'apppassword' });
    assert.ok(options.connectionTimeout <= 15000, 'has a timeout so a blocked port cannot hang a request');
  });
});

describe('email service', () => {
  it('sends the rendered OTP message through the transport', async () => {
    const sent = [];
    const service = createEmailService({ transport: { name: 'fake', send: async (m) => sent.push(m) }, from: from.email, fromName: 'NutriLens' });
    await service.sendOtp({ to: 'asha@example.com', code: '654321', purpose: 'login' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'asha@example.com');
    assert.match(sent[0].text, /654321/);
    assert.deepEqual(sent[0].from, { email: from.email, name: 'NutriLens' });
  });

  it('turns any provider failure into one generic 503 and logs only a safe reason (no code, no address, no key)', async () => {
    const logger = createCapturingLogger();
    const transport = { name: 'brevo', send: async () => { const e = new Error('boom 654321 asha@example.com xkeysib-1'); e.reason = 'brevo_http:401'; throw e; } };
    const service = createEmailService({ transport, from: from.email, logger });
    await assert.rejects(service.sendOtp({ to: 'asha@example.com', code: '654321', purpose: 'register' }), (err) => err.status === 503 && err.code === 'EMAIL_SEND_FAILED' && !err.message.includes('654321'));
    const logged = logger.lines.join('\n');
    assert.match(logged, /brevo_http:401/);
    assert.doesNotMatch(logged, /654321|asha@example|xkeysib/);
  });
});
