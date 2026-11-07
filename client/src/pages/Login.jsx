import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasErrors, validateLoginForm } from '../hooks/authValidation.js';
import { toApiError } from '../services/apiError.js';

/** Only follow redirects to paths inside this app. */
function safeRedirect(from) {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard';
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef(null);

  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event) {
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
      navigate(safeRedirect(location.state?.from), { replace: true });
    } catch (err) {
      const apiError = toApiError(err);
      setFieldErrors(apiError.fieldErrors);
      setFormError(apiError.message);
      setSubmitting(false);
    }
  }

  return (
    <section className="nl-container auth">
      <div className="auth__aside">
        <p className="nl-eyebrow">Welcome back</p>
        <h1 className="auth__title">Log in to NutriLens</h1>
        <p className="auth__lead">
          Your account is where your food preferences and label history will live as NutriLens
          grows.
        </p>
      </div>

      <div className="nl-label auth__card">
        <h2 className="nl-label__title">Log in</h2>
        <div className="nl-rule nl-rule--heavy" aria-hidden="true" />

        <form ref={formRef} onSubmit={handleSubmit} noValidate className="auth__form">
          {formError && (
            <p className="nl-alert" role="alert">
              <Icon name="alert" size={20} />
              {formError}
            </p>
          )}
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={handleChange}
            error={fieldErrors.email}
          />
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={values.password}
            onChange={handleChange}
            error={fieldErrors.password}
          />
          <button type="submit" className="nl-btn nl-btn--primary nl-btn--block" disabled={submitting} aria-busy={submitting}>
            {submitting && <Icon name="loader" size={18} className="nl-spin" />}
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="auth__switch">
          New to NutriLens? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </section>
  );
}
