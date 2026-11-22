import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AnalysisView from '../components/AnalysisView.jsx';
import Icon from '../components/Icon.jsx';
import { toApiError } from '../services/apiError.js';
import { deleteScan, getScan } from '../services/scanService.js';

/** A saved scan, shown exactly as it was calculated when it was saved. */
export default function ScanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', scan: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', scan: null, error: null });
    getScan(id)
      .then((scan) => !cancelled && setState({ status: 'ready', scan, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', scan: null, error: toApiError(err) }));
    return () => { cancelled = true; };
  }, [id]);

  const [confirming, setConfirming] = useState(false);

  async function remove() {
    try {
      await deleteScan(id);
      navigate('/history');
    } catch (err) {
      setState((s) => ({ ...s, error: toApiError(err) }));
    }
  }

  return (
    <section className="nl-container page scan">
      <p><Link to="/history" className="card__link"><Icon name="arrow" size={16} className="flip" /> Back to history</Link></p>
      {state.status === 'loading' && <p role="status"><Icon name="loader" size={20} className="nl-spin" /> Loading…</p>}
      {state.error && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>}
      {state.scan && (
        <AnalysisView analysis={state.scan.analysis} explanation={state.scan.explanation}>
          <div className="result-actions">
            <Link className="nl-btn nl-btn--primary" to="/scan">Scan another label</Link>
            {confirming ? (
              <>
                <span className="result-actions__saved">Delete this scan?</span>
                <button type="button" className="nl-btn nl-btn--danger nl-btn--sm" onClick={remove}>Delete</button>
                <button type="button" className="nl-btn nl-btn--ghost nl-btn--sm" onClick={() => setConfirming(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" className="nl-btn nl-btn--ghost" onClick={() => setConfirming(true)}><Icon name="trash" size={18} /> Delete this scan</button>
            )}
          </div>
        </AnalysisView>
      )}
    </section>
  );
}
