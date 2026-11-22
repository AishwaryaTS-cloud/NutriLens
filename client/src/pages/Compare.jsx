import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AllergenPanel } from '../components/AnalysisView.jsx';
import Icon from '../components/Icon.jsx';
import { LEVEL_TEXT, scoreTone } from '../hooks/labelForm.js';
import { toApiError } from '../services/apiError.js';
import { compareScans, listScans } from '../services/scanService.js';
import { formatDate } from './History.jsx';

const NUTRIENTS = ['sugar', 'addedSugar', 'protein', 'fibre', 'sodium', 'fat', 'saturatedFat', 'carbohydrates'];
const PARTS = [['preference', 'Personal Preference'], ['quality', 'Nutrition Quality'], ['ingredient', 'Ingredients']];
const whole = (n) => (n === null || n === undefined ? '—' : String(Math.round(n)));
const fmt = (n) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const name = (item, fallback) => item.productName ?? fallback;

/** Which side is better for a pair of numbers: 'a', 'b' or null. `lower` flips the direction. */
function better(x, y, lower = false) {
  if (x === null || x === undefined || y === null || y === undefined || x === y) return null;
  return (x < y) === lower ? 'a' : 'b';
}

/** Step 1: choose two saved products when none were passed in the address. */
function Picker() {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', scans: [], error: null });
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listScans()
      .then((scans) => !cancelled && setState({ status: 'ready', scans, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', scans: [], error: toApiError(err) }));
    return () => { cancelled = true; };
  }, []);

  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1], id] : [...cur, id]));

  if (state.status === 'loading') return <p className="page-loading" role="status"><Icon name="loader" size={20} className="nl-spin" /> Loading your scans…</p>;
  if (state.status === 'error') return <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>;
  if (state.scans.length < 2) {
    return (
      <div className="card">
        <div className="empty-state">
          <span className="empty-state__icon"><Icon name="compare" size={28} /></span>
          <h3>Save two products to compare them</h3>
          <p>{state.scans.length === 0 ? 'You have no saved scans yet.' : 'You have one saved scan so far.'} Scan and save at least two products, then come back here.</p>
          <Link to="/scan" className="nl-btn nl-btn--primary">Scan a product</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card__head">
        <h2 className="card__title">Choose two products ({picked.length}/2)</h2>
        <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={picked.length !== 2} onClick={() => navigate(`/compare?a=${picked[0]}&b=${picked[1]}`)}>Compare</button>
      </div>
      <ul className="scan-list">
        {state.scans.map((scan) => (
          <li key={scan.id}>
            <label className={`scan-row scan-row--pick${picked.includes(scan.id) ? ' is-picked' : ''}`}>
              <input type="checkbox" checked={picked.includes(scan.id)} onChange={() => toggle(scan.id)} />
              <span className="scan-row__main">
                <span className="scan-row__name">{scan.productName ?? 'Unnamed product'}</span>
                <span className="product-card__meta">{scan.brand ? `${scan.brand} · ` : ''}{formatDate(scan.createdAt)}</span>
              </span>
              <span className={`score-badge score-badge--${scoreTone(scan.finalScore)}`}>{scan.finalScore ?? 'No score'}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductHead({ item, fallback, winner }) {
  const m = item.analysis.match;
  return (
    <div className={`card cmp-head${winner ? ' is-winner' : ''}`}>
      <span className={`cmp-head__flag${winner ? '' : ' is-hidden'}`} aria-hidden={!winner}><Icon name="check" size={16} /> Better match for you</span>
      <div className={`score-ring score-ring--${scoreTone(m.finalScore)} score-ring--sm`}>
        <span className="score-ring__value">{m.finalScore ?? '—'}</span>
        <span className="score-ring__of">of 100</span>
      </div>
      <h2 className="cmp-head__name">{name(item, fallback)}</h2>
      {item.brand && <p className="cmp-head__brand">{item.brand}</p>}
      <p className="nl-field__hint">Base {fmt(m.baseScore)}{m.allergenPenalty.total > 0 && ` · allergen penalty −${m.allergenPenalty.total}`}</p>
    </div>
  );
}

function CmpRow({ label, a, b, win }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className={win === 'a' ? 'is-better' : ''}>{a}</td>
      <td className={win === 'b' ? 'is-better' : ''}>{b}</td>
    </tr>
  );
}

function IngredientCol({ item, fallback }) {
  const ing = item.analysis.match.details.ingredient;
  return (
    <div className="card">
      <h3 className="card__title">{name(item, fallback)}</h3>
      {item.analysis.label.ingredientsText
        ? <p className="ing-text">{item.analysis.label.ingredientsText}</p>
        : <p className="muted-note">No ingredient list was available.</p>}
      {ing.findings.length > 0 && (
        <ul className="finding-list">
          {ing.findings.map((f, i) => (
            <li key={`${f.rule}-${i}`} className={`finding finding--${f.points > 0 ? 'good' : 'bad'}`}>
              <span className="finding__points">{f.points > 0 ? '+' : ''}{f.points}</span><span>{f.message}</span>
            </li>
          ))}
        </ul>
      )}
      {ing.dietConflicts.length > 0 && <p className="nl-alert"><Icon name="alert" size={20} /><span>{ing.dietConflicts.map((c) => c.message).join(' ')}</span></p>}
    </div>
  );
}

/** Two saved products scored with the same functions and your current preferences. */
export default function Compare() {
  const [params] = useSearchParams();
  const a = params.get('a');
  const b = params.get('b');
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!a || !b) return undefined;
    setState({ status: 'loading', data: null, error: null });
    compareScans(a, b)
      .then((data) => !cancelled && setState({ status: 'ready', data, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', data: null, error: toApiError(err) }));
    return () => { cancelled = true; };
  }, [a, b]);

  const data = state.data;
  const hasPair = Boolean(a && b);
  const nameA = data ? name(data.a, 'First product') : '';
  const nameB = data ? name(data.b, 'Second product') : '';
  const qualityDir = (k) => {
    const item = data.a.analysis.match.details.quality.items.find((i) => i.nutrient === k) ?? data.b.analysis.match.details.quality.items.find((i) => i.nutrient === k);
    return item ? item.direction === 'lower' : null;
  };

  return (
    <section className="nl-container page">
      <header className="page__head">
        <div>
          <p className="nl-eyebrow">Compare products</p>
          <h1 className="page__title">{hasPair ? 'Side by side' : 'Compare two products'}</h1>
          <p className="page__lead">Both products are scored with the same calculation and your current preferences. A higher score never makes a product safe: check the allergen warnings.</p>
        </div>
        {hasPair && <Link to="/compare" className="nl-btn nl-btn--outline nl-btn--sm"><Icon name="refresh" size={18} /> Choose different products</Link>}
      </header>

      {!hasPair && <Picker />}
      {hasPair && state.status === 'loading' && <p className="page-loading" role="status"><Icon name="loader" size={20} className="nl-spin" /> Comparing…</p>}
      {hasPair && state.status === 'error' && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{state.error.message}</span></p>}

      {data && (
        <div className="cmp">
          <p className="cmp-verdict" role="status">
            {data.winner === 'tie' && 'Both products have the same Personal Match Score.'}
            {data.winner === 'a' && <>Better match for you: <strong>{nameA}</strong></>}
            {data.winner === 'b' && <>Better match for you: <strong>{nameB}</strong></>}
            {data.winner === null && 'No winner can be named.'}
          </p>
          {data.notes.length > 0 && <ul className="muted-list">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

          <div className="cmp-heads">
            <ProductHead item={data.a} fallback="First product" winner={data.winner === 'a'} />
            <ProductHead item={data.b} fallback="Second product" winner={data.winner === 'b'} />
          </div>

          <h2 className="cmp-title">Allergens</h2>
          <div className="cmp-pair">
            <AllergenPanel match={data.a.analysis.match} />
            <AllergenPanel match={data.b.analysis.match} />
          </div>

          <h2 className="cmp-title">Score breakdown</h2>
          <div className="card table-card">
            <div className="table-wrap">
              <table className="result-table cmp-table">
                <thead><tr><th scope="col"><span className="sr-only">Part</span></th><th scope="col">{nameA}</th><th scope="col">{nameB}</th></tr></thead>
                <tbody>
                  {PARTS.map(([k, label]) => {
                    const x = data.a.analysis.match.components[k].score;
                    const y = data.b.analysis.match.components[k].score;
                    return <CmpRow key={k} label={label} a={whole(x)} b={whole(y)} win={better(x, y)} />;
                  })}
                  <CmpRow label="Final score" a={<strong>{whole(data.a.analysis.match.finalScore)}</strong>} b={<strong>{whole(data.b.analysis.match.finalScore)}</strong>} win={better(data.a.analysis.match.finalScore, data.b.analysis.match.finalScore)} />
                </tbody>
              </table>
            </div>
          </div>

          <h2 className="cmp-title">Nutrition per 100 g</h2>
          <div className="card table-card">
            <div className="table-wrap">
              <table className="result-table cmp-table">
                <thead><tr><th scope="col"><span className="sr-only">Nutrient</span></th><th scope="col">{nameA}</th><th scope="col">{nameB}</th></tr></thead>
                <tbody>
                  {NUTRIENTS.map((k) => {
                    const x = data.a.analysis.nutrients[k];
                    const y = data.b.analysis.nutrients[k];
                    const lower = qualityDir(k);
                    const tone = (n) => {
                      const l = n.level?.toLowerCase();
                      if (!l || lower === null) return l ?? '';
                      const t = lower ? (l === 'low' ? 'good' : l === 'medium' ? 'medium' : 'high') : (l === 'high' ? 'good' : l === 'medium' ? 'medium' : 'high');
                      return t === 'good' ? `${l} level--good` : t === 'high' && !lower ? `${l} level--high level--bad` : l;
                    };
                    const cell = (n) => (n.value === null ? <em>not available</em> : <>{fmt(n.value)} {n.unit} {n.level && <span className={`level level--${tone(n)}`}>{LEVEL_TEXT[n.level]}</span>}</>);
                    return <CmpRow key={k} label={x.label} a={cell(x)} b={cell(y)} win={lower === null ? null : better(x.value, y.value, lower)} />;
                  })}
                </tbody>
              </table>
            </div>
            <p className="nl-field__hint">Highlighted cells are the better value for the nutrient (lower is better for sugar, sodium and fats; higher for protein and fibre).</p>
          </div>

          <h2 className="cmp-title">Ingredients</h2>
          <div className="cmp-pair">
            <IngredientCol item={data.a} fallback="First product" />
            <IngredientCol item={data.b} fallback="Second product" />
          </div>
        </div>
      )}
    </section>
  );
}
