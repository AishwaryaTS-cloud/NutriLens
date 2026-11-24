import { MailError } from './errors.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo's transactional email HTTPS API (port 443), which works on hosts that block SMTP.
 * The sender address must be verified in the Brevo dashboard.
 */
export function createBrevoTransport({ apiKey, fetchImpl = fetch, timeoutMs = 10_000 }) {
  return {
    name: 'brevo',
    async send({ from, to, subject, text, html }) {
      let response;
      try {
        response = await fetchImpl(BREVO_URL, {
          method: 'POST',
          headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: from.name, email: from.email }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new MailError('network', err?.name === 'TimeoutError' ? 'timeout' : 'unreachable');
      }
      // The response body is deliberately not read or logged: only the status is kept.
      if (!response.ok) throw new MailError('brevo_http', response.status);
    },
  };
}
