import { barPercent, describeNutrientRow, levelTone, relationBadge, verdictText } from '../hooks/compareView.js';
import { LEVEL_TEXT, scoreTone } from '../hooks/labelForm.js';
import Icon from './Icon.jsx';

const fmt = (n) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const whole = (n) => (n === null || n === undefined ? '—' : String(Math.round(n)));
const SIDES = ['a', 'b'];
const TONE_ICON = { danger: 'alert', warn: 'alert', good: 'check', info: 'leaf' };

function ProductHead({ side, item, details, winner }) {
  const m = item.analysis.match;
  const name = details.names[side];
  const isWinner = winner === side;
  return (
    <div className={`card cmp-head${isWinner ? ' is-winner' : ''}`}>
      <div className="cmp-head__top">
        <span className="cmp-head__letter" aria-hidden="true">{side.toUpperCase()}</span>
        <span className={`cmp-head__flag${isWinner ? '' : ' is-hidden'}`} aria-hidden={!isWinner}><Icon name="check" size={16} /> Better match</span>
      </div>
      <div className={`score-ring score-ring--${scoreTone(m.finalScore)} score-ring--sm`} role="img" aria-label={m.finalScore === null ? `${name}: no score` : `${name}: Personal Match Score ${m.finalScore} out of 100`}>
        <span className="score-ring__value">{m.finalScore ?? '—'}</span>
        <span className="score-ring__of">{m.finalScore === null ? 'no score' : 'of 100'}</span>
      </div>
      <h2 className="cmp-head__name">{name}</h2>
      {item.brand && <p className="cmp-head__brand">{item.brand}</p>}
      <p className="cmp-head__tags">
        <span className="badge badge--flush">{item.saved ? 'Saved scan' : 'Not saved'}</span>
        {m.allergenPenalty.hasConfirmedConflict && <span className="badge badge--confirmed badge--flush">Allergen conflict</span>}
      </p>
    </div>
  );
}

function Summary({ details }) {
  const items = details.summary.filter((item) => !(item.kind === 'allergen' && item.tone === 'danger'));
  return (
    <section className="card cmp-summary" aria-labelledby="sum-title">
      <h2 id="sum-title" className="card__title">Summary of the differences</h2>
      <ul className="cmp-summary__list">
        {items.map((item, i) => (
          <li key={i} className={`cmp-point cmp-point--${item.tone}`}>
            <Icon name={TONE_ICON[item.tone] ?? 'leaf'} size={20} />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <p className="nl-field__hint">Every point above is taken directly from the label values and scores of these two products.</p>
    </section>
  );
}

/** Allergens in the user's saved list: shown once, above everything else. */
function AllergenAlerts({ details }) {
  const dangers = details.summary.filter((s) => s.kind === 'allergen' && s.tone === 'danger');
  if (dangers.length === 0) return null;
  return (
    <div className="cmp-alerts" role="alert">
      {dangers.map((s, i) => (
        <p key={i} className="cmp-alert cmp-alert--danger"><Icon name="alert" size={22} /><span>{s.text}</span></p>
      ))}
    </div>
  );
}

function Chips({ items, empty = 'None' }) {
  if (items.length === 0) return <p className="muted-note">{empty}</p>;
  return <ul className="chip-list">{items.map((t, i) => <li key={`${t}-${i}`} className="chip-static">{t}</li>)}</ul>;
}

function AllergenChip({ entry, note }) {
  return (
    <li className={`allergen-chip allergen-chip--${entry.tier}${entry.matchesUser ? ' is-yours' : ''}`}>
      <strong>{entry.label}</strong>
      <span>{note ?? entry.tierText}</span>
      {entry.matchesUser && <em><Icon name="alert" size={14} /> In your allergens</em>}
    </li>
  );
}

function AllergenGroup({ title, entries, noteFor, empty }) {
  return (
    <div className="allergen-group">
      <h3>{title}</h3>
      {entries.length === 0 ? <p className="muted-note">{empty}</p> : <ul className="allergen-chips">{entries.map((e) => <AllergenChip key={e.id} entry={e} note={noteFor?.(e)} />)}</ul>}
    </div>
  );
}

function Allergens({ details }) {
  const { allergens, names } = details;
  const items = details.summary.filter((s) => s.kind === 'allergen' && s.tone !== 'danger');
  const none = allergens.a.entries.length === 0 && allergens.b.entries.length === 0;
  return (
    <section className="cmp-section" aria-labelledby="allergen-title">
      <h2 id="allergen-title" className="cmp-title">Allergens</h2>
      {items.map((s, i) => (
        <p key={i} className={`cmp-alert cmp-alert--${s.tone}`} role={s.tone === 'danger' ? 'alert' : undefined}>
          <Icon name={s.tone === 'info' ? 'shield' : 'alert'} size={22} /><span>{s.text}</span>
        </p>
      ))}
      <div className="card">
        {none && allergens.a.complete && allergens.b.complete ? (
          <p>No allergens were detected in either product. Always check the printed label as well.</p>
        ) : (
          <div className="allergen-groups">
            <AllergenGroup title="In both products" entries={allergens.common} noteFor={(e) => (e.tierTextA === e.tierTextB ? e.tierTextA : `${names.a}: ${e.tierTextA} · ${names.b}: ${e.tierTextB}`)} empty="No allergen appears in both." />
            <AllergenGroup title={`Only in ${names.a}`} entries={allergens.onlyA} empty="No allergen is unique to this product." />
            <AllergenGroup title={`Only in ${names.b}`} entries={allergens.onlyB} empty="No allergen is unique to this product." />
          </div>
        )}
        <ul className="muted-list">
          {SIDES.map((s) => <li key={s}><strong>{names[s]}:</strong> {allergens[s].complete ? 'allergen information is complete.' : `allergen information is incomplete. ${allergens[s].reason}`}</li>)}
        </ul>
      </div>
    </section>
  );
}

function ScoreRow({ label, a, b, leader, names, strong }) {
  return (
    <li className={`score-row${strong ? ' score-row--strong' : ''}`}>
      <span className="score-row__label">{label}</span>
      {SIDES.map((s) => {
        const v = s === 'a' ? a : b;
        return (
          <span key={s} className={`score-row__cell${leader === s ? ' is-leader' : ''}`}>
            <span className="score-row__name">{names[s]}</span>
            <strong>{whole(v)}</strong>
            <span className="meter meter--thin" aria-hidden="true"><span className={`meter__fill meter__fill--${scoreTone(v)}`} style={{ width: `${v ?? 0}%` }} /></span>
          </span>
        );
      })}
    </li>
  );
}

function Scores({ details, comparison }) {
  const { scores, names } = details;
  const p = scores.personal;
  const close = p.margin !== null && p.margin > 0 && p.margin < 5;
  return (
    <section className="cmp-section" aria-labelledby="scores-title">
      <h2 id="scores-title" className="cmp-title">Scores</h2>
      <div className="card">
        <p className="cmp-verdict" role="status">{verdictText(comparison.winner, names)}</p>
        {close && <p className="nl-field__hint">The gap is small ({p.margin} {p.margin === 1 ? 'point' : 'points'}), so both products fit you similarly.</p>}
        <ul className="score-rows">
          <ScoreRow label="Personal Match Score" a={p.a} b={p.b} leader={p.leader} names={names} strong />
          {scores.parts.map((part) => <ScoreRow key={part.key} label={part.label} a={part.a} b={part.b} leader={part.leader} names={names} />)}
        </ul>
        {scores.explanation.length > 0 && (
          <>
            <h3 className="cmp-sub">Why the scores differ</h3>
            <ul className="muted-list">{scores.explanation.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </>
        )}
        <p className="nl-field__hint">
          {SIDES.map((s) => `${names[s]}: base score ${whole(scores.base[s])}${scores.allergenPenalty[s] > 0 ? `, minus ${scores.allergenPenalty[s]} for allergens` : ''}`).join('. ')}.
          Scores use your saved preferences and are not medical advice.
        </p>
      </div>
    </section>
  );
}

function ValueCell({ row, side, names }) {
  const value = side === 'a' ? row.a : row.b;
  const level = side === 'a' ? row.levelA : row.levelB;
  const badge = relationBadge(row, side);
  const better = row.better === side;
  return (
    <div className={`ncell${better ? ' is-better' : ''}`}>
      <span className="ncell__who">{names[side]}</span>
      {value === null ? <span className="ncell__value ncell__value--missing">Not available</span> : (
        <>
          <span className="ncell__value">{fmt(value)}<small> {row.unit}</small></span>
          <span className="meter meter--thin" aria-hidden="true"><span className={`meter__fill meter__fill--${better ? 'good' : 'none'}`} style={{ width: `${barPercent(value, row.a, row.b)}%` }} /></span>
          <span className="ncell__tags">
            {badge && <span className="rel-badge">{badge}</span>}
            {level && <span className={`level-pill level-pill--${levelTone(level, row.direction)}`}>{LEVEL_TEXT[level]}</span>}
            {better && <span className="better-tag"><Icon name="check" size={14} /> Better</span>}
          </span>
        </>
      )}
    </div>
  );
}

function Nutrition({ details }) {
  const { names, nutrients, basis } = details;
  return (
    <section className="cmp-section" aria-labelledby="nutri-title">
      <h2 id="nutri-title" className="cmp-title">Nutrition per 100 {basis.a}</h2>
      <div className="card">
        <ul className="nrows">
          {nutrients.map((row) => {
            const d = describeNutrientRow(row, names);
            return (
              <li key={row.key} className="nrow">
                <h3 className="nrow__label">{row.label}</h3>
                <ValueCell row={row} side="a" names={names} />
                <ValueCell row={row} side="b" names={names} />
                <p className={`nrow__note nrow__note--${d.tone}`}>{d.text}</p>
              </li>
            );
          })}
        </ul>
        <p className="nl-field__hint">“Better” follows your own nutrient goals where you set one, and general guidance otherwise (less sugar, sodium and fat; more protein and fibre). Energy and added sugar are shown but not judged.</p>
      </div>
    </section>
  );
}

function FlagList({ flags, side }) {
  const mine = flags.filter((f) => f.side === side);
  if (mine.length === 0) return <p className="muted-note">No ingredient differences flagged.</p>;
  return (
    <ul className="finding-list">
      {mine.map((f, i) => (
        <li key={i} className={`finding finding--${f.kind === 'positive' ? 'good' : 'bad'}`}>
          <span className="finding__points">{f.points === null ? '!' : `${f.points > 0 ? '+' : ''}${f.points}`}</span><span>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}

function Ingredients({ details }) {
  const { ingredients: ing, names } = details;
  return (
    <section className="cmp-section" aria-labelledby="ing-title">
      <h2 id="ing-title" className="cmp-title">Ingredients</h2>
      {!ing.comparable && (
        <p className="cmp-alert cmp-alert--warn"><Icon name="alert" size={22} /><span>{SIDES.filter((s) => !ing.available[s]).map((s) => names[s]).join(' and ')} {SIDES.filter((s) => !ing.available[s]).length > 1 ? 'have' : 'has'} no ingredient list, so the lists can’t be compared.</span></p>
      )}
      {ing.comparable && (
        <div className="card">
          <p className="cmp-facts">
            {SIDES.map((s) => <span key={s}><strong>{names[s]}</strong>: {ing.counts[s]} ingredients{ing.firstIngredient[s] ? `, first: ${ing.firstIngredient[s]}` : ''}</span>)}
          </p>
          <div className="ing-groups">
            <div><h3>In both ({ing.common.length})</h3><Chips items={ing.common} empty="No ingredient is shared." /></div>
            <div><h3>Only in {names.a} ({ing.onlyA.length})</h3><Chips items={ing.onlyA} empty="Nothing unique to this product." /></div>
            <div><h3>Only in {names.b} ({ing.onlyB.length})</h3><Chips items={ing.onlyB} empty="Nothing unique to this product." /></div>
          </div>
          <h3 className="cmp-sub">Important differences</h3>
          <div className="cmp-pair">
            {SIDES.map((s) => <div key={s}><h4 className="cmp-minor">{names[s]}</h4><FlagList flags={ing.flags} side={s} /></div>)}
          </div>
          {(ing.additives.a.length > 0 || ing.additives.b.length > 0) && (
            <p className="nl-field__hint">Additive codes found: {names.a}: {ing.additives.a.join(', ') || 'none'}; {names.b}: {ing.additives.b.join(', ') || 'none'}.</p>
          )}
        </div>
      )}
      {(ing.textA || ing.textB) && (
        <details className="more">
          <summary>Full ingredient lists</summary>
          <div className="cmp-pair">
            {SIDES.map((s) => <div key={s}><h4 className="cmp-minor">{names[s]}</h4><p className="ing-text">{(s === 'a' ? ing.textA : ing.textB) ?? 'No ingredient list available.'}</p></div>)}
          </div>
        </details>
      )}
    </section>
  );
}

/** The full comparison: products, summary, allergens, scores, nutrition and ingredients. */
export default function ComparisonView({ comparison }) {
  const { details } = comparison;
  const notes = [...new Set([...(details.notes ?? []), ...comparison.notes])];
  return (
    <div className="cmp">
      <AllergenAlerts details={details} />
      <div className="cmp-heads">
        <ProductHead side="a" item={comparison.a} details={details} winner={comparison.winner} />
        <ProductHead side="b" item={comparison.b} details={details} winner={comparison.winner} />
      </div>
      <Summary details={details} />
      <Allergens details={details} />
      <Scores details={details} comparison={comparison} />
      <Nutrition details={details} />
      <Ingredients details={details} />
      {notes.length > 0 && (
        <section className="card" aria-labelledby="notes-title">
          <h2 id="notes-title" className="card__title">About this comparison</h2>
          <ul className="muted-list">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}
      <p className="disclaimer">Not medical advice. Check the printed labels, especially if you have an allergy.</p>
    </div>
  );
}
