import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PreferencesSummary from '../components/PreferencesSummary.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toApiError } from '../services/apiError.js';
import { fetchSummary } from '../services/scanService.js';
import { ScoreBadge } from './History.jsx';

function memberSince(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <small>{note}</small>}
    </div>
  );
}

/** Protected page: scan statistics, recent scans, account details and saved preferences. */
export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user.name.split(' ')[0];
  const [state, setState] = useState({ status: 'loading', summary: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchSummary()
      .then((summary) => !cancelled && setState({ status: 'ready', summary, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', summary: null, error: toApiError(err) }));
    return () => { cancelled = true; };
  }, []);

  const s = state.summary;

  return (
    <section className="nl-container dashboard">
      <header>
        <p className="nl-eyebrow">Dashboard</p>
        <h1 className="dashboard__title">Welcome, {firstName}.</h1>
        <p className="dashboard__lead">Scan a label, check what Gemini read, and see how the product matches your goals and allergens.</p>
      </header>

      <div className="dashboard__grid">
        <div className="dashboard__stack">
          <section className="nl-label" aria-labelledby="stats-title">
            <h2 id="stats-title" className="nl-label__title">Your scans</h2>
            <div className="nl-rule nl-rule--heavy" aria-hidden="true" />
            {state.status === 'loading' && <p role="status"><Icon name="loader" size={20} className="nl-spin" /> Loading…</p>}
            {state.status === 'error' && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>}
            {s && s.total === 0 && <p>You have not saved any scans yet.</p>}
            {s && s.total > 0 && (
              <dl className="stats">
                <Stat label="Saved scans" value={s.total} note={`up to ${s.maxSavedScans}`} />
                <Stat label="Average score" value={s.averageScore ?? '—'} note="scored products only" />
                <Stat label="Strong matches" value={s.bands.strong} note="score 70 or more" />
                <Stat label="Weak matches" value={s.bands.weak} note="score below 50" />
                <Stat label="Allergen conflicts" value={s.allergenConflicts} note="confirmed" />
                <Stat label="Allergen info incomplete" value={s.incompleteAllergenInfo} />
              </dl>
            )}
            {s && s.recent.length > 0 && (
              <>
                <h3 className="dashboard__next-title">Recent</h3>
                <ul className="history__list history__list--compact">
                  {s.recent.map((scan) => (
                    <li key={scan.id} className="history__item">
                      <div className="history__info">
                        <Link to={`/history/${scan.id}`} className="history__name">{scan.productName ?? 'Unnamed product'}</Link>
                        {scan.allergenConflict && <span className="badge badge--confirmed">Allergen conflict</span>}
                      </div>
                      <ScoreBadge score={scan.finalScore} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="review__actions">
              <Link to="/scan" className="nl-btn nl-btn--primary">Scan a label</Link>
              <Link to="/history" className="nl-btn nl-btn--outline">History and compare</Link>
            </div>
          </section>

          <PreferencesSummary />
        </div>

        <section className="nl-label" aria-labelledby="account-title">
          <h2 id="account-title" className="nl-label__title">Your account</h2>
          <div className="nl-rule nl-rule--heavy" aria-hidden="true" />
          <dl className="nl-label__rows">
            <div className="nl-label__row"><dt>Name</dt><dd>{user.name}</dd></div>
            <div className="nl-label__row"><dt>Email</dt><dd>{user.email}</dd></div>
            <div className="nl-label__row"><dt>Member since</dt><dd>{memberSince(user.createdAt)}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  );
}
