/** Pure helpers for the six-digit code screen (no React, so they are unit-tested). */

export const OTP_LENGTH = 6;

/** Keeps digits only (so pasted "123 456" or "123-456" works) and at most six of them. */
export const sanitizeCode = (value) => String(value ?? '').replace(/\D/g, '').slice(0, OTP_LENGTH);

export const isCompleteCode = (code) => /^\d{6}$/.test(code);

/**
 * One box was edited. `input` is whatever the box now contains: one digit when typing, several
 * when pasting or when the phone autofills the whole code into a single box, empty on delete.
 * Returns the new code and which box should get the focus next.
 */
export function editCode(code, index, input) {
  const digits = sanitizeCode(input);
  if (digits === '') {
    // Deleting a box removes that digit and keeps the others in place order.
    return { code: code.slice(0, index) + code.slice(index + 1), focus: Math.max(0, index) };
  }
  const next = sanitizeCode(code.slice(0, index) + digits + code.slice(index + 1));
  return { code: next, focus: Math.min(index + digits.length, OTP_LENGTH - 1) };
}

/** Backspace on an empty box: delete the previous digit and step back. */
export function backspaceCode(code, index) {
  if (index === 0) return { code, focus: 0 };
  return { code: code.slice(0, index - 1) + code.slice(index), focus: index - 1 };
}

/** Whole seconds left until a deadline, never negative. */
export const secondsUntil = (deadlineMs, nowMs) => Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));

/** 125 -> "2:05". */
export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Friendly text for the error codes the auth API can return for email codes and Google sign-in. */
export function authErrorMessage(error) {
  const wait = error?.fieldErrors?.retryAfterSeconds;
  switch (error?.code) {
    case 'OTP_INVALID':
      return 'That code is incorrect or has expired. Check the code, or request a new one.';
    case 'OTP_ATTEMPTS_EXCEEDED':
      return 'Too many incorrect codes. Request a new code to try again.';
    case 'OTP_SESSION_EXPIRED':
      return 'This verification has expired. Please start again.';
    case 'OTP_COOLDOWN':
      return wait ? `Please wait ${wait} seconds before requesting another code.` : 'Please wait a moment before requesting another code.';
    case 'OTP_RATE_LIMITED':
    case 'RATE_LIMITED':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'EMAIL_SEND_FAILED':
      return 'We couldn’t send the email. Please try again in a moment.';
    case 'EMAIL_UNAVAILABLE':
      return 'Email codes aren’t available right now. Please use your password instead.';
    case 'GOOGLE_UNAVAILABLE':
      return 'Google sign-in isn’t available right now.';
    case 'GOOGLE_EMAIL_UNVERIFIED':
      return 'Your Google account’s email isn’t verified, so it can’t be used to sign in.';
    case 'GOOGLE_ACCOUNT_CONFLICT':
      return 'This email is already connected to a different Google account.';
    case 'GOOGLE_NONCE_INVALID':
    case 'GOOGLE_TOKEN_INVALID':
      return 'Google sign-in didn’t complete. Please try again.';
    default:
      return error?.message || 'Something went wrong. Please try again.';
  }
}
