import { OTP_TTL_SECONDS } from '../../config/constants.js';

// NutriLens brand colours (the same tokens as the app) written out for email clients.
const LEAF = '#1f6f4a';
const INK = '#11271c';
const SOFT = '#4c6157';
const BG = '#f4f7f3';

const COPY = {
  register: { subject: 'Your NutriLens verification code', heading: 'Verify your email', intro: 'Use this code to finish creating your NutriLens account.' },
  login: { subject: 'Your NutriLens sign-in code', heading: 'Sign in to NutriLens', intro: 'Use this code to sign in to your NutriLens account.' },
  link: { subject: 'Confirm your email to connect Google', heading: 'Confirm your email', intro: 'Use this code to confirm your email and connect your Google account to NutriLens.' },
};

/** The OTP email. It contains the code and nothing personal: no name, no account details. */
export function renderOtpEmail({ code, purpose }) {
  const copy = COPY[purpose] ?? COPY.login;
  const minutes = Math.round(OTP_TTL_SECONDS / 60);
  const text = [
    `NutriLens: ${copy.heading}`,
    '',
    copy.intro,
    '',
    `Your code: ${code}`,
    '',
    `It expires in ${minutes} minutes and can be used once.`,
    'Never share this code with anyone. NutriLens will never ask you for it.',
    "If you didn't request it, you can ignore this email.",
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #d3dcd2;border-radius:12px;">
<tr><td style="padding:24px 28px 8px;font-size:22px;font-weight:800;color:${LEAF};letter-spacing:-0.5px;">NutriLens</td></tr>
<tr><td style="padding:8px 28px 0;font-size:18px;font-weight:700;">${copy.heading}</td></tr>
<tr><td style="padding:8px 28px 0;font-size:15px;line-height:22px;color:${SOFT};">${copy.intro}</td></tr>
<tr><td align="center" style="padding:24px 28px;"><div style="display:inline-block;padding:14px 22px;background:${BG};border:1px solid #d3dcd2;border-radius:10px;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:${INK};">${code}</div></td></tr>
<tr><td style="padding:0 28px;font-size:14px;line-height:21px;color:${SOFT};">This code expires in <strong>${minutes} minutes</strong> and can be used once.</td></tr>
<tr><td style="padding:16px 28px 0;font-size:14px;line-height:21px;color:${INK};"><strong>Never share this code.</strong> NutriLens will never ask you for it.</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:13px;line-height:19px;color:${SOFT};">If you didn&rsquo;t request this, you can safely ignore this email.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: copy.subject, text, html };
}
