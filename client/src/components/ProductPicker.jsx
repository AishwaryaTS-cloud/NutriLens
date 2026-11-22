import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { scoreTone } from '../hooks/labelForm.js';
import Icon from './Icon.jsx';

const formatDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

function Slot({ letter, product, onRemove, draft }) {
  if (!product) {
    return (
      <div className="slot slot--empty">
        <span className="slot__letter">{letter}</span>
        <p className="slot__hint">Choose a product from the list</p>
      </div>
    );
  }
  const score = product.finalScore;
  return (
    <div className="slot slot--filled">
      <span className="slot__letter">{letter}</span>
      <div className="slot__body">
        <p className="slot__name">{product.productName ?? 'Unnamed product'}</p>
        <p className="slot__meta">
          {draft ? 'Just analysed, not saved to your history' : `${product.brand ? `${product.brand} · ` : ''}${formatDate(product.createdAt)}`}
        </p>
        {product.allergenConflict && <span className="badge badge--confirmed badge--flush">Allergen conflict</span>}
      </div>
      {!draft && <span className={`score-badge score-badge--${scoreTone(score)}`}>{score ?? 'No score'}</span>}
      {onRemove && (
        <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove ${product.productName ?? 'product'} from the comparison`}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}

/**
 * Step 1 of a comparison: pick two products.
 * `draft` is an optional newly analysed (unsaved) product that always fills slot A.
 */
export default function ProductPicker({ scans, draft, initialIds = [], onCompare }) {
  const maxSaved = draft ? 1 : 2;
  const [ids, setIds] = useState(() => initialIds.filter((id) => scans.some((s) => s.id === id)).slice(0, maxSaved));
  const [query, setQuery] = useState('');

  const byId = useMemo(() => new Map(scans.map((s) => [s.id, s])), [scans]);
  const slotA = draft ? draft.summary : byId.get(ids[0]);
  const slotB = draft ? byId.get(ids[0]) : byId.get(ids[1]);
  const ready = Boolean(slotA && slotB);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? scans.filter((s) => `${s.productName ?? ''} ${s.brand ?? ''}`.toLowerCase().includes(q)) : scans;
  }, [scans, query]);

  const toggle = (id) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.slice(cur.length >= maxSaved ? 1 : 0), id]));
  const remove = (id) => setIds((cur) => cur.filter((x) => x !== id));
  const swap = () => !draft && setIds((cur) => [...cur].reverse());

  const needed = draft ? 1 : 2;
  if (scans.length < needed) {
    return (
      <div className="card">
        <div className="empty-state">
          <span className="empty-state__icon"><Icon name="compare" size={28} /></span>
          <h3>{draft ? 'Save a product to compare it with' : 'Save two products to compare them'}</h3>
          <p>
            {scans.length === 0 ? 'You have no saved scans yet.' : 'You have one saved scan so far.'}{' '}
            {draft ? 'Scan and save another product, then compare it with the one you just analysed.' : 'Scan and save at least two products, then come back here.'}
          </p>
          <Link to="/scan" className="nl-btn nl-btn--primary">Scan a product</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="picker">
      <div className="picker__slots" aria-label="Selected products">
        <Slot letter="A" product={slotA} draft={Boolean(draft)} onRemove={!draft && slotA ? () => remove(slotA.id) : undefined} />
        <button type="button" className="picker__swap" onClick={swap} disabled={Boolean(draft) || ids.length < 2} aria-label="Swap product A and B"><Icon name="compare" size={20} /></button>
        <Slot letter="B" product={slotB} onRemove={slotB ? () => remove(slotB.id) : undefined} />
      </div>
      <div className="picker__cta">
        <button type="button" className="nl-btn nl-btn--primary nl-btn--lg" disabled={!ready} onClick={() => onCompare(draft ? { a: { label: draft.label }, b: { scanId: ids[0] } } : { a: { scanId: ids[0] }, b: { scanId: ids[1] } })}>
          <Icon name="compare" size={20} /> Compare these products
        </button>
        {!ready && <p className="picker__hint" role="status">{draft ? 'Choose one saved product to compare with.' : ids.length === 0 ? 'Choose two products to compare.' : 'Choose one more product.'}</p>}
      </div>

      <section className="card" aria-labelledby="pick-title">
        <div className="card__head">
          <h2 id="pick-title" className="card__title">{draft ? 'Your saved products' : 'Saved scans'}</h2>
          <label className="search search--sm">
            <Icon name="search" size={18} />
            <span className="sr-only">Search saved scans</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product or brand" />
          </label>
        </div>
        {visible.length === 0 ? <p className="muted-note" role="status">No scans match your search.</p> : (
          <ul className="scan-list">
            {visible.map((scan) => {
              const on = ids.includes(scan.id);
              return (
                <li key={scan.id}>
                  <label className={`scan-row scan-row--pick${on ? ' is-picked' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(scan.id)} />
                    <span className="scan-row__main">
                      <span className="scan-row__name">{scan.productName ?? 'Unnamed product'}</span>
                      <span className="product-card__meta">{scan.brand ? `${scan.brand} · ` : ''}{formatDate(scan.createdAt)}</span>
                      {scan.allergenConflict && <span className="badge badge--confirmed">Allergen conflict</span>}
                    </span>
                    <span className={`score-badge score-badge--${scoreTone(scan.finalScore)}`}>{scan.finalScore ?? 'No score'}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="nl-field__hint">Scores are recalculated with your current preferences when you compare.</p>
      </section>
    </div>
  );
}
