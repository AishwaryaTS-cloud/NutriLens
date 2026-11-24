import nodemailer from 'nodemailer';
import { MailError } from './errors.js';

/**
 * Gmail over SMTP with an App Password (local development and hosts that allow SMTP).
 * Render's free web services block ports 25, 465 and 587, so use the Brevo transport there.
 * Gmail always sends as the authenticated account, so EMAIL_FROM should be that same address.
 */
export function createGmailTransport({ host = 'smtp.gmail.com', port = 465, user, pass, nodemailerTransport }) {
  const transporter =
    nodemailerTransport ??
    nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = TLS from the start; 587 upgrades with STARTTLS automatically
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

  return {
    name: 'gmail',
    async send({ from, to, subject, text, html }) {
      try {
        await transporter.sendMail({ from: { name: from.name, address: from.email }, to, subject, text, html });
      } catch (err) {
        // Only a short code is kept: the raw error can include the server's reply and the address.
        throw new MailError('smtp', err?.responseCode ?? err?.code ?? 'error');
      }
    },
  };
}
