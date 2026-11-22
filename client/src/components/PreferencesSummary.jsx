import { Link } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile.js';
import { summarizeProfile } from '../hooks/preferencesForm.js';
import Icon from './Icon.jsx';

function Rows({ summary }) {
  return (
    <dl className="pref-rows">
      <div className="pref-row">
        <dt>Dietary preference</dt>
        <dd>{summary.dietary}</dd>
      </div>
      <div className="pref-row">
        <dt>Nutrient priorities</dt>
        <dd>
          {summary.nutrients.length === 0 ? (
            <span className="summary__none">None chosen</span>
          ) : (
            <ul className="summary__list">
              {summary.nutrients.map((nutrient) => (
                <li key={nutrient.key}>
                  <strong>{nutrient.label}</strong>: {nutrient.goal}, weight {nutrient.weight}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
      <div className="pref-row">
        <dt>Allergens to avoid</dt>
        <dd>
          {summary.allergens.length === 0 ? (
            <span className="summary__none">None chosen</span>
          ) : (
            <ul className="summary__tags">
              {summary.allergens.map((label) => (
                <li className="nl-tag nl-tag--static" key={label}>
                  {label}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** Dashboard card: the saved preferences, or a prompt to set them. */
export default function PreferencesSummary() {
  const { status, profile, options, error, reload } = useProfile();

  let body;
  if (!profile || !options) {
    body =
      status === 'error' ? (
        <>
          <p className="nl-alert" role="alert">
            <Icon name="alert" size={20} />
            {error?.message ?? 'Couldn’t load your preferences.'}
          </p>
          <button type="button" className="nl-btn nl-btn--outline nl-btn--sm" onClick={reload}>
            Try again
          </button>
        </>
      ) : (
        <p className="summary__loading" role="status">
          <Icon name="loader" size={18} className="nl-spin" />
          Loading your preferences…
        </p>
      );
  } else {
    const summary = summarizeProfile(profile, options);
    body = summary.isConfigured ? (
      <>
        <Rows summary={summary} />
      </>
    ) : (
      <>
        <p className="summary__prompt">
          You haven’t set your preferences yet. Choose a dietary preference, the nutrients you care about
          and any allergens to avoid.
        </p>
        <Link to="/preferences" className="nl-btn nl-btn--primary">
          Set your preferences
        </Link>
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="prefs-title">
      <div className="card__head">
        <h2 id="prefs-title" className="card__title">Your preferences</h2>
        {profile && options && summarizeProfile(profile, options).isConfigured && <Link to="/preferences" className="card__link">Edit</Link>}
      </div>
      {body}
    </section>
  );
}
