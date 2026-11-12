import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { scoreTone } from '../hooks/labelForm.js';
import { toApiError } from '../services/apiError.js';
import { deleteScan, listScans } from '../services/scanService.js';

const date = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export function ScoreBadge({ score }) {
  return <span className={`score-badge score-badge--${scoreTone(score)}`}>{score === null ? 'No score' : score}</span>;
}

/** Saved scans: open, delete, or tick two to compare. */
export default function History() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', scans: [], error: null });
  const [picked, setPicked] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listScans()
      .then((scans) => !cancelled && setState({ status: 'ready', scans, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', scans: [], error: toApiError(err) }));
    return () => { cancelled = true; };
  }, []);

  function toggle(id) {
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : current.length >= 2 ? [current[1], id] : [...current, id]));
  }

  async function remove(scan) {
    if (!window.confirm(`Delete “${scan.productName ?? 'Unnamed product'}”? This cannot be undone.`)) return;
    setBusyId(scan.id);
    setActionError(null);
    try {
      await deleteScan(scan.id);
      setState((s) => ({ ...s, scans: s.scans.filter((x) => x.id !== scan.id) }));
      setPicked((p) => p.filter((x) => x !== scan.id));
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="nl-container history">
      <header className="scan__header">
        <p className="nl-eyebrow">History</p>
        <h1 className="scan__title">Your saved scans</h1>
        <p className="scan__lead">Tick two scans to compare them. Comparisons use your current preferences.</p>
      </header>

      {state.status === 'loading' && <p role="status"><Icon name="loader" size={20} className="nl-spin" /> Loading your scans…</p>}
      {state.status === 'error' && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>}
      {actionError && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{actionError.message}</span></p>}

      {state.status === 'ready' && state.scans.length === 0 && (
        <div className="empty"><p>You have no saved scans yet.</p><Link to="/scan" className="nl-btn nl-btn--primary">Scan a label</Link></div>
      )}

      {state.scans.length > 0 && (
        <>
          <div className="history__bar">
            <button type="button" className="nl-btn nl-btn--primary" disabled={picked.length !== 2} onClick={() => navigate(`/compare?a=${picked[0]}&b=${picked[1]}`)}>
              Compare selected ({picked.length}/2)
            </button>
          </div>
          <ul className="history__list">
            {state.scans.map((scan) => (
              <li key={scan.id} className="history__item">
                <label className="history__pick">
                  <input type="checkbox" checked={picked.includes(scan.id)} onChange={() => toggle(scan.id)} />
                  <span className="sr-only">Select {scan.productName ?? 'Unnamed product'} for comparison</span>
                </label>
                <div className="history__info">
                  <Link to={`/history/${scan.id}`} className="history__name">{scan.productName ?? 'Unnamed product'}</Link>
                  <span className="history__meta">{scan.brand ? `${scan.brand} · ` : ''}{date(scan.createdAt)}</span>
                  <span className="history__flags">
                    {scan.allergenConflict && <span className="badge badge--confirmed">Allergen conflict</span>}
                    {!scan.allergenConflict && scan.allergenStatus !== 'complete' && <span className="badge badge--warn">Allergen info incomplete</span>}
                  </span>
                </div>
                <ScoreBadge score={scan.finalScore} />
                <button type="button" className="nl-btn nl-btn--ghost nl-btn--sm" onClick={() => remove(scan)} disabled={busyId === scan.id}>Delete</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
