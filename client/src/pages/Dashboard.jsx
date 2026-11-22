import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PreferencesSummary from '../components/PreferencesSummary.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { toApiError } from '../services/apiError.js';
import { fetchSummary } from '../services/scanService.js';
import { ScoreBadge } from './History.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Stat({ label, value, note, tone }) {
  return (
    <div className={`stat-card${tone ? ` stat-card--${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <small>{note}</small>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Icon name="scan" size={28} /></span>
      <h3>Scan your first product</h3>
      <p>Take a photo of a food label. NutriLens reads it, checks it against your allergens and goals, and explains the result.</p>
      <Link to="/scan" className="nl-btn nl-btn--primary">Scan a product</Link>
    </div>
  );
}

/** Signed-in home: scan call to action, real statistics, recent scans and saved preferences. */
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
    <section className="nl-container page">
      <header className="page__head">
        <div>
          <p className="nl-eyebrow">{greeting()}</p>
          <h1 className="page__title">Welcome back, {firstName}</h1>
          <p className="page__lead">Scan a label to see how a product fits your goals and allergens.</p>
        </div>
        <Link to="/scan" className="nl-btn nl-btn--primary nl-btn--lg"><Icon name="scan" size={20} /> Scan a product</Link>
      </header>

      {state.status === 'loading' && <p className="page-loading" role="status"><Icon name="loader" size={20} className="nl-spin" /> Loading your dashboard…</p>}
      {state.status === 'error' && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>}

      {s && (
        <div className="dash-grid">
          <div className="dash-main">
            {s.total > 0 && (
              <dl className="stat-grid" aria-label="Your scan statistics">
                <Stat label="Saved scans" value={s.total} note={`of ${s.maxSavedScans} allowed`} />
                <Stat label="Average score" value={s.averageScore ?? '—'} note="scored products" />
                <Stat label="Strong matches" value={s.bands.strong} note="score 70 or more" tone="good" />
                <Stat label="Allergen conflicts" value={s.allergenConflicts} note="confirmed" tone={s.allergenConflicts > 0 ? 'warn' : undefined} />
              </dl>
            )}

            <section className="card" aria-labelledby="recent-title">
              <div className="card__head">
                <h2 id="recent-title" className="card__title">Recent scans</h2>
                {s.total > 0 && <Link to="/history" className="card__link">View all <Icon name="arrow" size={16} /></Link>}
              </div>
              {s.recent.length === 0 ? <EmptyState /> : (
                <ul className="scan-list">
                  {s.recent.map((scan) => (
                    <li key={scan.id}>
                      <Link to={`/history/${scan.id}`} className="scan-row">
                        <span className="scan-row__main">
                          <span className="scan-row__name">{scan.productName ?? 'Unnamed product'}</span>
                          {scan.allergenConflict && <span className="badge badge--confirmed">Allergen conflict</span>}
                        </span>
                        <ScoreBadge score={scan.finalScore} />
                        <Icon name="arrow" size={18} className="scan-row__go" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="dash-side">
            <PreferencesSummary />
            <nav className="card quick" aria-label="Quick access">
              <h2 className="card__title">Quick access</h2>
              <Link to="/history"><Icon name="history" size={20} /> Scan history</Link>
              <Link to="/compare"><Icon name="compare" size={20} /> Compare products</Link>
              <Link to="/preferences"><Icon name="user" size={20} /> Profile and preferences</Link>
            </nav>
          </aside>
        </div>
      )}
    </section>
  );
}
