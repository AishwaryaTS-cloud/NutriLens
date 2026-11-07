import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AllergenPicker from '../components/AllergenPicker.jsx';
import ChoiceGroup from '../components/ChoiceGroup.jsx';
import FormField from '../components/FormField.jsx';
import Icon from '../components/Icon.jsx';
import NutrientRow from '../components/NutrientRow.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  addCustomAllergen,
  hasErrors,
  removeCustomAllergen,
  setNutrientField,
  setNutrientSelected,
  setOtherOpen,
  toFormState,
  toPayload,
  toggleAllergen,
  validateNameValue,
  validatePreferencesForm,
} from '../hooks/preferencesForm.js';
import { useProfile } from '../hooks/useProfile.js';
import { toApiError } from '../services/apiError.js';
import { savePreferences, updateName } from '../services/profileService.js';

function focusFirstInvalid(root) {
  requestAnimationFrame(() => {
    root?.querySelector('input[aria-invalid="true"], [data-invalid="true"] input, [data-invalid="true"] button')?.focus();
  });
}

function NameSection() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaved(false);
    const problem = validateNameValue(name);
    setError(problem ?? '');
    if (problem) return;

    setSaving(true);
    try {
      const updated = await updateName(name);
      updateUser(updated);
      setName(updated.name);
      setSaved(true);
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError.fieldErrors.name ?? apiError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="nl-label prefs__panel" aria-labelledby="name-title">
      <h2 id="name-title" className="nl-label__title">
        Your name
      </h2>
      <div className="nl-rule nl-rule--heavy" aria-hidden="true" />
      <form onSubmit={handleSubmit} noValidate className="prefs__form">
        <FormField
          label="Display name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError('');
            setSaved(false);
          }}
          error={error}
          hint={`Your email (${user.email}) can’t be changed here.`}
        />
        <div className="prefs__actions">
          <button type="submit" className="nl-btn nl-btn--primary" disabled={saving} aria-busy={saving}>
            {saving && <Icon name="loader" size={18} className="nl-spin" />}
            {saving ? 'Saving…' : 'Save name'}
          </button>
          {saved && (
            <p className="prefs__saved" role="status">
              <Icon name="check" size={18} />
              Name saved.
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

export default function Preferences() {
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef(null);
  const { status, profile, options, error: loadError, reload, setProfile } = useProfile();
  const onboarding = location.state?.onboarding === true;

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Build the form once, when the saved profile and the option lists have arrived.
  useEffect(() => {
    if (profile && options && form === null) setForm(toFormState(profile, options));
  }, [profile, options, form]);

  function change(updater) {
    setForm(updater);
    setSaved(false);
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaved(false);
    setFormError('');

    const clientErrors = validatePreferencesForm(form, options);
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) {
      focusFirstInvalid(formRef.current);
      return;
    }

    setSaving(true);
    try {
      const savedProfile = await savePreferences(toPayload(form, options));
      setProfile(savedProfile);
      setForm(toFormState(savedProfile, options));
      setErrors({});
      if (onboarding) navigate('/dashboard', { replace: true });
      else setSaved(true);
    } catch (err) {
      const apiError = toApiError(err);
      setErrors(apiError.fieldErrors);
      setFormError(apiError.message);
      focusFirstInvalid(formRef.current);
    } finally {
      setSaving(false);
    }
  }

  const showSkip = onboarding && profile && !profile.isConfigured;

  let body;
  if (!form || !options) {
    body =
      status === 'error' ? (
        <div className="prefs__state">
          <p className="nl-alert" role="alert">
            <Icon name="alert" size={20} />
            {loadError?.message ?? 'Couldn’t load your preferences.'}
          </p>
          <button type="button" className="nl-btn nl-btn--outline" onClick={reload}>
            Try again
          </button>
        </div>
      ) : (
        <p className="page-loading prefs__state" role="status">
          <Icon name="loader" size={24} className="nl-spin" />
          Loading your preferences…
        </p>
      );
  } else {
    body = (
      <>
        <NameSection />

        <section className="nl-label prefs__panel" aria-labelledby="prefs-title">
          <h2 id="prefs-title" className="nl-label__title">
            Your preferences
          </h2>
          <div className="nl-rule nl-rule--heavy" aria-hidden="true" />

          <form ref={formRef} onSubmit={handleSave} noValidate className="prefs__form">
            {formError && (
              <p className="nl-alert" role="alert">
                <Icon name="alert" size={20} />
                {formError}
              </p>
            )}

            <div className="prefs__section">
              <ChoiceGroup
                legend="Dietary preference"
                name="dietary"
                options={options.dietaryPreferences.map((item) => ({ value: item.key, label: item.label }))}
                value={form.dietaryPreference}
                onChange={(value) => change((current) => ({ ...current, dietaryPreference: value }))}
                error={errors.dietaryPreference}
                hint="Saved with your profile for future dietary checks. It doesn’t change any score yet."
              />
            </div>

            <div className="nl-rule nl-rule--medium" aria-hidden="true" />

            <div className="prefs__section">
              <h3 className="prefs__heading">Nutrient priorities</h3>
              <p className="nl-field__hint">
                Tick the nutrients you care about. The goal says which direction you prefer, and the weight says how
                much it matters to you. Nutrients are compared per 100 g. You can leave all of them unticked.
              </p>
              {errors.nutrientPreferences && (
                <p className="nl-field__error">
                  <Icon name="alert" size={16} />
                  {errors.nutrientPreferences}
                </p>
              )}
              <div className="prefs__nutrients">
                {options.nutrients.map((nutrient) => (
                  <NutrientRow
                    key={nutrient.key}
                    nutrient={nutrient}
                    state={form.nutrients[nutrient.key]}
                    weights={options.weights}
                    error={errors[`nutrientPreferences.${nutrient.key}`]}
                    onSelect={(selected) => change((current) => setNutrientSelected(current, nutrient.key, selected))}
                    onField={(field, value) => change((current) => setNutrientField(current, nutrient.key, field, value))}
                  />
                ))}
              </div>
            </div>

            <div className="nl-rule nl-rule--medium" aria-hidden="true" />

            <div className="prefs__section">
              <AllergenPicker
                options={options}
                form={form}
                errors={errors}
                onToggle={(key) => change((current) => toggleAllergen(current, key))}
                onOtherToggle={(open) => change((current) => setOtherOpen(current, open))}
                onDraftChange={(text) => {
                  change((current) => ({ ...current, customDraft: text }));
                  setErrors((current) => ({ ...current, customDraft: undefined }));
                }}
                onAddCustom={() => {
                  const result = addCustomAllergen(form, options);
                  change(() => result.form);
                  setErrors((current) => ({ ...current, customDraft: result.error }));
                }}
                onRemoveCustom={(index) => change((current) => removeCustomAllergen(current, index))}
              />
            </div>

            <div className="prefs__actions">
              <button type="submit" className="nl-btn nl-btn--primary" disabled={saving} aria-busy={saving}>
                {saving && <Icon name="loader" size={18} className="nl-spin" />}
                {saving ? 'Saving…' : 'Save preferences'}
              </button>
              {showSkip && (
                <Link to="/dashboard" className="nl-btn nl-btn--ghost">
                  Skip for now
                </Link>
              )}
              {saved && (
                <p className="prefs__saved" role="status">
                  <Icon name="check" size={18} />
                  Preferences saved.
                </p>
              )}
            </div>
          </form>
        </section>
      </>
    );
  }

  return (
    <section className="nl-container prefs">
      <header className="prefs__header">
        <p className="nl-eyebrow">{onboarding ? 'Welcome to NutriLens' : 'Your profile'}</p>
        <h1 className="prefs__title">{onboarding ? 'Set your preferences' : 'Your preferences'}</h1>
        <p className="prefs__lead">
          Tell NutriLens what matters to you. You can change any of this later. Scanning isn’t available yet, so
          nothing here changes a score today.
        </p>
        {showSkip && (
          <Link to="/dashboard" className="nl-btn nl-btn--ghost nl-btn--sm">
            Skip for now
          </Link>
        )}
      </header>
      {body}
    </section>
  );
}
