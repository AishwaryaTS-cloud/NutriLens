import { useCallback, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import FormField from '../components/FormField.jsx';
import GoogleButton, { isGoogleConfigured } from '../components/GoogleButton.jsx';
import Icon from '../components/Icon.jsx';
import OtpVerification from '../components/OtpVerification.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasErrors, validateEmailForm, validateLoginForm } from '../hooks/authValidation.js';
import { authErrorMessage } from '../hooks/otp.js';
import { useGoogleAuth } from '../hooks/useGoogleAuth.js';
import { toApiError } from '../services/apiError.js';
import * as authApi from '../services/authService.js';

/** Only follow redirects to paths inside this app. */
function safeRedirect(from) {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard';
}

export default function Login() {
  const { login, loginWithCode, completeGoogleLink } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef(null);
  const destination = safeRedirect(location.state?.from);

  const [method, setMethod] = useState('password'); // 'password' | 'code'
  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // verify: the code screen, for email-code login ('login') or confirming an email to link Google ('link')
  const [verify, setVerify] = useState(null); // { kind, email, expiresInSeconds, resendAvailableInSeconds }

  const google = useGoogleAuth({
    onSignedIn: (isNewUser) => navigate(isNewUser ? '/preferences' : destination, { replace: true, state: isNewUser ? { onboarding: true } : undefined }),
    onVerification: (info) => setVerify({ kind: 'link', ...info }),
  });

  const chooseMethod = (next) => {
    setMethod(next);
    setFieldErrors({});
    setFormError('');
    google.clearError();
  };

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    const errors = validateLoginForm(values);
    setFieldErrors(errors);
    setFormError('');
    if (hasErrors(errors)) {
      formRef.current?.elements[Object.keys(errors)[0]]?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await login(values);
      navigate(destination, { replace: true });
    } catch (err) {
      const apiError = toApiError(err);
      setFieldErrors(apiError.fieldErrors);
      setFormError(apiError.message);
      setSubmitting(false);
    }
  }

  async function handleSendCode(event) {
    event.preventDefault();
    const errors = validateEmailForm(values);
    setFieldErrors(errors);
    setFormError('');
    if (hasErrors(errors)) {
      formRef.current?.elements.email?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const timing = await authApi.requestLoginCode(values.email.trim());
      setVerify({ kind: 'login', ...timing });
    } catch (err) {
      setFormError(authErrorMessage(toApiError(err)));
    } finally {
      setSubmitting(false);
    }
  }

  const finishVerification = useCallback(() => navigate(destination, { replace: true }), [navigate, destination]);

  if (verify) {
    const email = verify.email ?? values.email.trim().toLowerCase();
    const isLink = verify.kind === 'link';
    return (
      <section className="nl-container auth">
        <div className="auth__aside">
          <p className="nl-eyebrow">{isLink ? 'Connect Google' : 'Email code'}</p>
          <h1 className="auth__title">{isLink ? 'Confirm it’s you' : 'Check your email'}</h1>
          <p className="auth__lead">
            {isLink
              ? 'An account with this email already exists. To connect your Google account safely, confirm that you own the email address.'
              : 'Enter the 6-digit code to log in without a password.'}
          </p>
        </div>
        <div className="card auth__card">
          <OtpVerification
            email={email}
            intro={isLink ? <>We sent a 6-digit code to <strong>{email}</strong> to confirm it’s yours.</> : <>If <strong>{email}</strong> has a NutriLens account, we’ve sent it a 6-digit code.</>}
            expiresInSeconds={verify.expiresInSeconds}
            resendSeconds={verify.resendAvailableInSeconds}
            onVerify={async (code) => {
              await (isLink ? completeGoogleLink({ email, code }) : loginWithCode({ email, code }));
              finishVerification();
            }}
            onResend={() => (isLink ? authApi.resendGoogleLinkCode(email) : authApi.requestLoginCode(email))}
            onBack={() => setVerify(null)}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="nl-container auth">
      <div className="auth__aside">
        <p className="nl-eyebrow">Welcome back</p>
        <h1 className="auth__title">Log in to NutriLens</h1>
        <p className="auth__lead">
          Pick up where you left off: your scan history, comparisons and preferences are waiting.
        </p>
      </div>

      <div className="card auth__card">
        <h2 className="card__title auth__card-title">Log in</h2>

        {google.error && (
          <p className="nl-alert" role="alert">
            <Icon name="alert" size={20} />
            {google.error}
          </p>
        )}
        {isGoogleConfigured && (
          <>
            <GoogleButton onCredential={google.handleCredential} disabled={google.busy || submitting} />
            {google.busy && <p className="auth__note" role="status">Signing you in with Google…</p>}
            <div className="auth-divider" role="separator"><span>or</span></div>
          </>
        )}

        <div className="method-tabs" role="group" aria-label="Log in method">
          <button type="button" aria-pressed={method === 'password'} onClick={() => chooseMethod('password')}>Password</button>
          <button type="button" aria-pressed={method === 'code'} onClick={() => chooseMethod('code')}>Email code</button>
        </div>

        <form ref={formRef} onSubmit={method === 'password' ? handlePasswordSubmit : handleSendCode} noValidate className="auth__form">
          {formError && (
            <p className="nl-alert" role="alert">
              <Icon name="alert" size={20} />
              {formError}
            </p>
          )}
          <FormField label="Email" name="email" type="email" autoComplete="email" value={values.email} onChange={handleChange} error={fieldErrors.email} />
          {method === 'password' ? (
            <FormField label="Password" name="password" type="password" autoComplete="current-password" value={values.password} onChange={handleChange} error={fieldErrors.password} />
          ) : (
            <p className="auth__note">We’ll email you a 6-digit code. No password needed.</p>
          )}
          <button type="submit" className="nl-btn nl-btn--primary nl-btn--block" disabled={submitting || google.busy} aria-busy={submitting}>
            {submitting && <Icon name="loader" size={18} className="nl-spin" />}
            {method === 'password' ? (submitting ? 'Logging in…' : 'Log in') : submitting ? 'Sending code…' : 'Email me a code'}
          </button>
        </form>

        <p className="auth__switch">
          New to NutriLens? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </section>
  );
}
