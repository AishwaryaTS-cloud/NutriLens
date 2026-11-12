import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AllergenPanel } from '../components/AnalysisView.jsx';
import Icon from '../components/Icon.jsx';
import { LEVEL_TEXT } from '../hooks/labelForm.js';
import { toApiError } from '../services/apiError.js';
import { compareScans } from '../services/scanService.js';
import { ScoreBadge } from './History.jsx';

const NUTRIENTS = ['sugar', 'addedSugar', 'protein', 'fibre', 'sodium', 'fat', 'saturatedFat', 'carbohydrates'];
const fmt = (n) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Two saved products scored with the same functions and your current preferences. */
export default function Compare() {
  const [params] = useSearchParams();
  const a = params.get('a');
  const b = params.get('b');
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!a || !b) {
      setState({ status: 'error', data: null, error: { message: 'Choose two saved scans from your history to compare.' } });
      return undefined;
    }
    setState({ status: 'loading', data: null, error: null });
    compareScans(a, b)
      .then((data) => !cancelled && setState({ status: 'ready', data, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', data: null, error: toApiError(err) }));
    return () => { cancelled = true; };
  }, [a, b]);

  const data = state.data;
  const columns = data ? [['a', data.a], ['b', data.b]] : [];

  return (
    <section className="nl-container compare">
      <header className="scan__header">
        <p className="nl-eyebrow">Compare</p>
        <h1 className="scan__title">Product comparison</h1>
        <p className="scan__lead">Both products are scored with the same calculation and your current preferences. Allergen warnings are shown separately: a higher score does not make a product safe.</p>
      </header>
      <p><Link to="/history">← Back to history</Link></p>
      {state.status === 'loading' && <p role="status"><Icon name="loader" size={20} className="nl-spin" /> Comparing…</p>}
      {state.status === 'error' && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>}

      {data && (
        <>
          <p className="compare__winner" role="status">
            {data.winner === 'tie' && 'Both products have the same Personal Match Score.'}
            {data.winner === 'a' && <>Better match for you: <strong>{data.a.productName ?? 'First product'}</strong></>}
            {data.winner === 'b' && <>Better match for you: <strong>{data.b.productName ?? 'Second product'}</strong></>}
            {data.winner === null && 'No winner can be named.'}
          </p>
          {data.notes.length > 0 && <ul className="compare__notes">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

          <div className="compare__heads">
            {columns.map(([key, item]) => (
              <div key={key} className="result-card compare__head">
                <h2 className="result-card__title">{item.productName ?? 'Unnamed product'}</h2>
                {item.brand && <p className="result-head__brand">{item.brand}</p>}
                <ScoreBadge score={item.analysis.match.finalScore} />
                <p className="nl-field__hint">Base {fmt(item.analysis.match.baseScore)}, allergen penalty {item.analysis.match.allergenPenalty.total}</p>
              </div>
            ))}
          </div>

          <div className="compare__allergens">
            {columns.map(([key, item]) => <AllergenPanel key={key} match={item.analysis.match} />)}
          </div>

          <div className="result-card">
            <h2 className="result-card__title">Score parts</h2>
            <div className="table-wrap">
              <table className="result-table">
                <thead><tr><th scope="col">Part</th><th scope="col">{data.a.productName ?? 'First'}</th><th scope="col">{data.b.productName ?? 'Second'}</th></tr></thead>
                <tbody>
                  {[['preference', 'Personal Preference'], ['quality', 'Nutrition Quality'], ['ingredient', 'Ingredients']].map(([k, name]) => (
                    <tr key={k}><th scope="row">{name}</th><td>{fmt(data.a.analysis.match.components[k].score)}</td><td>{fmt(data.b.analysis.match.components[k].score)}</td></tr>
                  ))}
                  <tr className="result-table__sum"><th scope="row">Final score</th><td>{fmt(data.a.analysis.match.finalScore)}</td><td>{fmt(data.b.analysis.match.finalScore)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="result-card">
            <h2 className="result-card__title">Nutrients per 100 g</h2>
            <div className="table-wrap">
              <table className="result-table">
                <thead><tr><th scope="col">Nutrient</th><th scope="col">{data.a.productName ?? 'First'}</th><th scope="col">{data.b.productName ?? 'Second'}</th></tr></thead>
                <tbody>
                  {NUTRIENTS.map((k) => {
                    const x = data.a.analysis.nutrients[k];
                    const y = data.b.analysis.nutrients[k];
                    const cell = (n) => (n.value === null ? <em>not available</em> : <>{fmt(n.value)} {n.unit} <span className={`level level--${n.level.toLowerCase()}`}>{LEVEL_TEXT[n.level]}</span></>);
                    return <tr key={k}><th scope="row">{x.label}</th><td>{cell(x)}</td><td>{cell(y)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
