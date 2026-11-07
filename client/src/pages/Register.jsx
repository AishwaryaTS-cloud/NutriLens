import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasErrors, validateRegisterForm } from '../hooks/authValidation.js';
import { toApiError } from '../services/apiError.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const formRef = useRef(null);

  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' });
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
    const errors = validateRegisterForm(values);
    setFieldErrors(errors);
    setFormError('');
    if (hasErrors(errors)) {
      formRef.current?.elements[Object.keys(errors)[0]]?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await register({ name: values.name, email: values.email, password: values.password });
      navigate('/preferences', { replace: true, state: { onboarding: true } });
    } catch (err) {
      const apiError = toApiError(err);
      setFieldErrors(apiError.fieldErrors);
      // Field errors (for example "email already exists") are shown on the field itself.
      setFormError(hasErrors(apiError.fieldErrors) ? '' : apiError.message);
      setSubmitting(false);
    }
  }

  return (
    <section className="nl-container auth">
      <div className="auth__aside">
        <p className="nl-eyebrow">Get started</p>
        <h1 className="auth__title">Create your NutriLens account</h1>
        <p className="auth__lead">
          Free to use. Your password is stored only as a salted hash, and your session cookie can’t
          be read by page scripts.
        </p>
      </div>

      <div className="nl-label auth__card">
        <h2 className="nl-label__title">Create account</h2>
        <div className="nl-rule nl-rule--heavy" aria-hidden="true" />

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
          <button type="submit" className="nl-btn nl-btn--primary nl-btn--block" disabled={submitting} aria-busy={submitting}>
            {submitting && <Icon name="loader" size={18} className="nl-spin" />}
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth__switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </section>
  );
}
