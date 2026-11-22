import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { scoreTone } from '../hooks/labelForm.js';
import { toApiError } from '../services/apiError.js';
import { deleteScan, listScans } from '../services/scanService.js';

export const formatDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export function ScoreBadge({ score }) {
  return <span className={`score-badge score-badge--${scoreTone(score)}`}>{score === null ? 'No score' : score}</span>;
}

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'strong', label: 'Strong match', test: (s) => s.finalScore !== null && s.finalScore >= 70 },
  { id: 'weak', label: 'Weak match', test: (s) => s.finalScore !== null && s.finalScore < 50 },
  { id: 'allergen', label: 'Allergen conflict', test: (s) => s.allergenConflict },
];

/** Saved scans as cards: search, filter, open, delete, or tick two to compare. */
export default function History() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', scans: [], error: null });
  const [picked, setPicked] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listScans()
      .then((scans) => !cancelled && setState({ status: 'ready', scans, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', scans: [], error: toApiError(err) }));
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter).test;
    return state.scans.filter((s) => test(s) && (!q || `${s.productName ?? ''} ${s.brand ?? ''}`.toLowerCase().includes(q)));
  }, [state.scans, query, filter]);

  function toggle(id) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1], id] : [...cur, id]));
  }

  async function remove(scan) {
    setBusyId(scan.id);
    setActionError(null);
    try {
      await deleteScan(scan.id);
      setState((s) => ({ ...s, scans: s.scans.filter((x) => x.id !== scan.id) }));
      setPicked((p) => p.filter((x) => x !== scan.id));
      setConfirmId(null);
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  const hasScans = state.scans.length > 0;

  return (
    <section className="nl-container page">
      <header className="page__head">
        <div>
          <p className="nl-eyebrow">History</p>
          <h1 className="page__title">Your saved scans</h1>
          <p className="page__lead">Open a scan to see its full analysis, or select two products to compare them.</p>
        </div>
        <Link to="/scan" className="nl-btn nl-btn--primary"><Icon name="scan" size={18} /> Scan a product</Link>
      </header>

      {state.status === 'loading' && <p className="page-loading" role="status"><Icon name="loader" size={20} className="nl-spin" /> Loading your scans…</p>}
      {state.status === 'error' && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>}
      {actionError && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{actionError.message}</span></p>}

      {state.status === 'ready' && !hasScans && (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state__icon"><Icon name="history" size={28} /></span>
            <h3>No saved scans yet</h3>
            <p>Scan a product and save it, and it will appear here so you can revisit or compare it later.</p>
            <Link to="/scan" className="nl-btn nl-btn--primary">Scan a product</Link>
          </div>
        </div>
      )}

      {hasScans && (
        <>
          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={18} />
              <span className="sr-only">Search saved scans</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product or brand" />
            </label>
            <div className="chips" role="group" aria-label="Filter scans">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className={`chip${filter === f.id ? ' is-active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="muted-note" role="status">No scans match your search or filter.</p>
          ) : (
            <ul className="product-grid">
              {visible.map((scan) => {
                const isPicked = picked.includes(scan.id);
                const name = scan.productName ?? 'Unnamed product';
                return (
                  <li key={scan.id} className={`product-card${isPicked ? ' is-picked' : ''}`}>
                    <div className="product-card__top">
                      <div className={`score-tile score-tile--${scoreTone(scan.finalScore)}`} aria-label={scan.finalScore === null ? 'No score' : `Score ${scan.finalScore} out of 100`}>
                        <strong>{scan.finalScore ?? '—'}</strong>
                        <span>{scan.finalScore === null ? 'no score' : 'match'}</span>
                      </div>
                      <div className="product-card__info">
                        <Link to={`/history/${scan.id}`} className="product-card__name">{name}</Link>
                        <span className="product-card__meta">{scan.brand ? `${scan.brand} · ` : ''}{formatDate(scan.createdAt)}</span>
                        <span className="product-card__flags">
                          {scan.allergenConflict && <span className="badge badge--confirmed">Allergen conflict</span>}
                          {!scan.allergenConflict && scan.allergenStatus !== 'complete' && <span className="badge badge--warn">Allergen info incomplete</span>}
                        </span>
                      </div>
                    </div>
                    <div className="product-card__actions">
                      {confirmId === scan.id ? (
                        <>
                          <span className="product-card__confirm">Delete this scan?</span>
                          <button type="button" className="nl-btn nl-btn--danger nl-btn--sm" onClick={() => remove(scan)} disabled={busyId === scan.id}>{busyId === scan.id ? 'Deleting…' : 'Delete'}</button>
                          <button type="button" className="nl-btn nl-btn--ghost nl-btn--sm" onClick={() => setConfirmId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <label className="pick">
                            <input type="checkbox" checked={isPicked} onChange={() => toggle(scan.id)} />
                            <span>Compare</span>
                            <span className="sr-only"> {name}</span>
                          </label>
                          <Link to={`/history/${scan.id}`} className="nl-btn nl-btn--outline nl-btn--sm">View</Link>
                          <button type="button" className="icon-btn" onClick={() => setConfirmId(scan.id)} aria-label={`Delete ${name}`}><Icon name="trash" size={18} /></button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {picked.length > 0 && (
            <div className="compare-bar" role="region" aria-label="Compare selected products">
              <span>{picked.length === 1 ? 'Select one more product to compare' : '2 products selected'}</span>
              <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={picked.length !== 2} onClick={() => navigate(`/compare?a=${picked[0]}&b=${picked[1]}`)}>
                <Icon name="compare" size={18} /> Compare
              </button>
              <button type="button" className="nl-btn nl-btn--ghost nl-btn--sm" onClick={() => setPicked([])}>Clear</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
