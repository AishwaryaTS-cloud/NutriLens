import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FormField from '../components/FormField.jsx';
import GoogleButton, { isGoogleConfigured } from '../components/GoogleButton.jsx';
import Icon from '../components/Icon.jsx';
import OtpVerification from '../components/OtpVerification.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasErrors, validateRegisterForm } from '../hooks/authValidation.js';
import { authErrorMessage } from '../hooks/otp.js';
import { useGoogleAuth } from '../hooks/useGoogleAuth.js';
import { toApiError } from '../services/apiError.js';
import * as authApi from '../services/authService.js';

const ONBOARDING = { replace: true, state: { onboarding: true } };

export default function Register() {
  const { completeRegistration, completeGoogleLink } = useAuth();
  const navigate = useNavigate();
  const formRef = useRef(null);

  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // verify: the code screen. kind 'register' = confirm the sign-up email; 'link' = confirm before connecting Google.
  const [verify, setVerify] = useState(null); // { kind, email, expiresInSeconds, resendAvailableInSeconds }

  const google = useGoogleAuth({
    onSignedIn: (isNewUser) => (isNewUser ? navigate('/preferences', ONBOARDING) : navigate('/dashboard', { replace: true })),
    onVerification: (info) => setVerify({ kind: 'link', ...info }),
  });

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const errors = validateRegisterForm(values);
    setFieldErrors(errors);
    setFormError('');
    if (hasErrors(errors)) {
      formRef.current?.elements[Object.keys(errors)[0]]?.focus();
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: nothing is created yet. We email a code; the account is made when it is entered.
      const timing = await authApi.startRegistration({ name: values.name, email: values.email, password: values.password });
      setVerify({ kind: 'register', ...timing });
    } catch (err) {
      const apiError = toApiError(err);
      setFieldErrors(apiError.fieldErrors);
      // Field errors (for example "email already exists") are shown on the field itself.
      setFormError(hasErrors(apiError.fieldErrors) && apiError.code !== 'OTP_COOLDOWN' ? '' : authErrorMessage(apiError));
    } finally {
      setSubmitting(false);
    }
  }

  if (verify) {
    const isLink = verify.kind === 'link';
    const email = verify.email;
    return (
      <section className="nl-container auth">
        <div className="auth__aside">
          <p className="nl-eyebrow">{isLink ? 'Connect Google' : 'Almost there'}</p>
          <h1 className="auth__title">{isLink ? 'Confirm it’s you' : 'Verify your email'}</h1>
          <p className="auth__lead">
            {isLink
              ? 'An account with this email already exists. To connect your Google account safely, confirm that you own the email address.'
              : 'We just need to confirm this email belongs to you. Your account is created as soon as you enter the code.'}
          </p>
        </div>
        <div className="card auth__card">
          <OtpVerification
            email={email}
            expiresInSeconds={verify.expiresInSeconds}
            resendSeconds={verify.resendAvailableInSeconds}
            onVerify={async (code) => {
              if (isLink) {
                await completeGoogleLink({ email, code });
                navigate('/dashboard', { replace: true });
              } else {
                await completeRegistration({ email, code });
                navigate('/preferences', ONBOARDING);
              }
            }}
            onResend={() => (isLink ? authApi.resendGoogleLinkCode(email) : authApi.resendRegistrationCode(email))}
            onBack={() => setVerify(null)}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="nl-container auth">
      <div className="auth__aside">
        <p className="nl-eyebrow">Get started</p>
        <h1 className="auth__title">Create your NutriLens account</h1>
        <p className="auth__lead">
          Free to use. Save your scans, set your diet and allergens, and compare products. We’ll email a
          code to confirm your address, and your password is stored securely.
        </p>
      </div>

      <div className="card auth__card">
        <h2 className="card__title auth__card-title">Create account</h2>

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
            <div className="auth-divider" role="separator"><span>or sign up with email</span></div>
          </>
        )}

        <form ref={formRef} onSubmit={handleSubmit} noValidate className="auth__form">
          {formError && (
            <p className="nl-alert" role="alert">
              <Icon name="alert" size={20} />
              {formError}
            </p>
          )}
          <FormField label="Name" name="name" autoComplete="name" value={values.name} onChange={handleChange} error={fieldErrors.name} />
          <FormField label="Email" name="email" type="email" autoComplete="email" value={values.email} onChange={handleChange} error={fieldErrors.email} />
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
            value={values.password}
            onChange={handleChange}
            error={fieldErrors.password}
          />
          <FormField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={handleChange}
            error={fieldErrors.confirmPassword}
          />
          <button type="submit" className="nl-btn nl-btn--primary nl-btn--block" disabled={submitting || google.busy} aria-busy={submitting}>
            {submitting && <Icon name="loader" size={18} className="nl-spin" />}
            {submitting ? 'Sending code…' : 'Continue'}
          </button>
        </form>

        <p className="auth__switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </section>
  );
}
