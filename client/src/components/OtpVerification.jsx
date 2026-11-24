import { useId, useState } from 'react';
import { OTP_LENGTH, authErrorMessage, formatCountdown, isCompleteCode } from '../hooks/otp.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { toApiError } from '../services/apiError.js';
import Icon from './Icon.jsx';
import OtpInput from './OtpInput.jsx';

/**
 * The six-digit code screen, shared by sign-up, email-code login and Google linking.
 *   onVerify(code): resolves when signed in (the parent navigates), rejects with an API error
 *   onResend():     resolves with { expiresInSeconds, resendAvailableInSeconds }
 *   onBack():       go back and use a different email
 */
export default function OtpVerification({ email, intro, expiresInSeconds = 300, resendSeconds = 60, onVerify, onResend, onBack }) {
  const labelId = useId();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const resendTimer = useCountdown(resendSeconds);
  const expiryTimer = useCountdown(expiresInSeconds);
  const expired = expiryTimer.remaining === 0;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isCompleteCode(code)) {
      setError(`Enter all ${OTP_LENGTH} digits of the code.`);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onVerify(code);
    } catch (err) {
      setError(authErrorMessage(toApiError(err)));
      setCode('');
      setBusy(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    setNotice('');
    try {
      const timing = await onResend();
      resendTimer.restart(timing?.resendAvailableInSeconds ?? 60);
      expiryTimer.restart(timing?.expiresInSeconds ?? 300);
      setCode('');
      setNotice('A new code is on its way. Check your inbox (and spam folder).');
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.code === 'OTP_COOLDOWN' && apiError.fieldErrors?.retryAfterSeconds) resendTimer.restart(apiError.fieldErrors.retryAfterSeconds);
      setError(authErrorMessage(apiError));
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="otp-panel">
      <h2 id={labelId} className="card__title auth__card-title">Check your email</h2>
      <p className="otp-panel__intro">
        {intro ?? <>We sent a 6-digit code to <strong>{email}</strong>.</>}{' '}
        <span className={expired ? 'otp-panel__expired' : undefined}>
          {expired ? 'This code has expired. Request a new one.' : `It expires in ${formatCountdown(expiryTimer.remaining)}.`}
        </span>
      </p>

      <form onSubmit={handleSubmit} noValidate className="auth__form">
        {error && (
          <p className="nl-alert" role="alert">
            <Icon name="alert" size={20} />
            {error}
          </p>
        )}
        {notice && (
          <p className="nl-notice" role="status">
            <Icon name="check" size={20} />
            {notice}
          </p>
        )}

        <OtpInput value={code} onChange={setCode} disabled={busy} invalid={Boolean(error)} autoFocus labelId={labelId} />

        <button type="submit" className="nl-btn nl-btn--primary nl-btn--block" disabled={busy || !isCompleteCode(code)} aria-busy={busy}>
          {busy && <Icon name="loader" size={18} className="nl-spin" />}
          {busy ? 'Verifying…' : 'Verify code'}
        </button>
      </form>

      <div className="otp-panel__actions">
        <button type="button" className="link-button" onClick={handleResend} disabled={resendTimer.remaining > 0 || resending || busy}>
          {resending ? 'Sending…' : resendTimer.remaining > 0 ? `Resend code in ${formatCountdown(resendTimer.remaining)}` : 'Resend code'}
        </button>
        {onBack && (
          <button type="button" className="link-button" onClick={onBack} disabled={busy}>
            Use a different email
          </button>
        )}
      </div>
    </div>
  );
}
