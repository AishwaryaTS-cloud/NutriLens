import { HttpError } from '../utils/httpError.js';
import { createBrevoTransport } from './mail/brevoTransport.js';
import { createGmailTransport } from './mail/gmailTransport.js';
import { renderOtpEmail } from './mail/templates.js';

/**
 * Builds the configured transport. `email` comes from parseEnv:
 * { provider: 'gmail' | 'brevo', from, fromName, smtp: { host, port, user, pass }, brevoApiKey }
 */
export function createTransport(email) {
  if (email.provider === 'gmail') return createGmailTransport(email.smtp);
  if (email.provider === 'brevo') return createBrevoTransport({ apiKey: email.brevoApiKey });
  throw new Error(`Unknown EMAIL_PROVIDER: ${email.provider}`);
}

/**
 * Sends NutriLens emails through whichever transport is configured. A failure is logged with a
 * short safe reason only (never the code, the address or any credential) and surfaced to the
 * caller as one friendly, generic error.
 */
export function createEmailService({ transport, from, fromName = 'NutriLens', logger }) {
  return {
    provider: transport.name,
    async sendOtp({ to, code, purpose }) {
      // No await before transport.send: the message is handed over immediately.
      const message = renderOtpEmail({ code, purpose });
      try {
        await transport.send({ from: { email: from, name: fromName }, to, ...message });
      } catch (err) {
        logger?.error('OTP email delivery failed', { provider: transport.name, reason: err?.reason ?? 'unknown' });
        throw new HttpError(503, 'EMAIL_SEND_FAILED', "We couldn't send the email. Please try again in a moment.");
      }
    },
  };
}
