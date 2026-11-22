import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ComparisonView from '../components/ComparisonView.jsx';
import Icon from '../components/Icon.jsx';
import ProductPicker from '../components/ProductPicker.jsx';
import { toApiError } from '../services/apiError.js';
import { compareProducts, compareScans, listScans } from '../services/scanService.js';

/**
 * Food Product Comparison.
 *  /compare            choose two saved products (or one saved product + a product you just analysed)
 *  /compare?a=ID&b=ID  two saved scans (shareable link)
 *  /compare?a=ID       product A preselected
 * A newly analysed, unsaved product arrives through router state ({ draft: { label, name } }).
 */
export default function Compare() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const a = params.get('a');
  const b = params.get('b');
  const draftState = location.state?.draft ?? null;
  const draft = draftState ? { label: draftState.label, summary: { productName: draftState.name ?? draftState.label.productName ?? 'New product', finalScore: null, allergenConflict: false } } : null;

  const [local, setLocal] = useState(null); // a request started from the picker (needed when one product is unsaved)
  const request = local ?? (a && b ? { a: { scanId: a }, b: { scanId: b } } : null);
  const requestKey = request ? JSON.stringify(request) : '';

  const [scans, setScans] = useState({ status: 'loading', list: [], error: null });
  const [result, setResult] = useState({ status: 'idle', data: null, error: null });

  useEffect(() => {
    if (request) return undefined;
    let cancelled = false;
    setScans((s) => ({ ...s, status: 'loading' }));
    listScans()
      .then((list) => !cancelled && setScans({ status: 'ready', list, error: null }))
      .catch((err) => !cancelled && setScans({ status: 'error', list: [], error: toApiError(err) }));
    return () => { cancelled = true; };
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!request) { setResult({ status: 'idle', data: null, error: null }); return undefined; }
    let cancelled = false;
    setResult({ status: 'loading', data: null, error: null });
    const run = request.a.scanId && request.b.scanId ? compareScans(request.a.scanId, request.b.scanId) : compareProducts(request.a, request.b);
    run
      .then((data) => !cancelled && setResult({ status: 'ready', data, error: null }))
      .catch((err) => !cancelled && setResult({ status: 'error', data: null, error: toApiError(err) }));
    return () => { cancelled = true; };
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function start(next) {
    if (next.a.scanId && next.b.scanId) navigate(`/compare?a=${next.a.scanId}&b=${next.b.scanId}`);
    else setLocal(next);
  }

  function reset() {
    setLocal(null);
    navigate('/compare', { state: location.state });
  }

  return (
    <section className="nl-container page">
      <header className="page__head">
        <div>
          <p className="nl-eyebrow">Compare products</p>
          <h1 className="page__title">{request ? 'Side by side' : 'Compare two products'}</h1>
          <p className="page__lead">
            {request
              ? 'Nutrition, ingredients, allergens and scores, calculated with your current preferences.'
              : 'Pick two products to see how their nutrition, ingredients, allergens and Personal Match Scores differ.'}
          </p>
        </div>
        {request && <button type="button" className="nl-btn nl-btn--outline nl-btn--sm" onClick={reset}><Icon name="refresh" size={18} /> Choose different products</button>}
      </header>

      {!request && scans.status === 'loading' && <p className="page-loading" role="status"><Icon name="loader" size={20} className="nl-spin" /> Loading your scans…</p>}
      {!request && scans.status === 'error' && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{scans.error.message}</span></p>}
      {!request && scans.status === 'ready' && (
        <>
          <ProductPicker scans={scans.list} draft={draft} initialIds={a ? [a] : []} onCompare={start} />
          {!draft && <p className="muted-note picker__tip">To compare a product you haven’t saved, <Link to="/scan">scan it</Link> and choose “Compare with a saved product” on its results.</p>}
        </>
      )}

      {request && result.status === 'loading' && <p className="page-loading" role="status"><Icon name="loader" size={20} className="nl-spin" /> Comparing…</p>}
      {request && result.status === 'error' && (
        <div className="stack">
          <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{result.error.message}</span></p>
          <button type="button" className="nl-btn nl-btn--outline" onClick={reset}>Choose products again</button>
        </div>
      )}
      {request && result.status === 'ready' && <ComparisonView comparison={result.data} />}
    </section>
  );
}
