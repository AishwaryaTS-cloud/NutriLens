import Icon from './Icon.jsx';
import { LEVEL_TEXT, scoreTone } from '../hooks/labelForm.js';

const fmt = (n) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const TIER_TEXT = { confirmed: 'Confirmed', precautionary: 'May contain', possible: 'Possible' };
const STATUS_TEXT = { complete: 'Complete', incomplete: 'Incomplete', unavailable: 'Unavailable' };
const COMPONENT_NAMES = { preference: 'Personal Preference', quality: 'Nutrition Quality', ingredient: 'Ingredients' };
const FALLBACK_TEXT = {
  GEMINI_NOT_CONFIGURED: 'Gemini is not set up on this server.',
  GEMINI_QUOTA: 'The free Gemini quota is used up for now.',
  GEMINI_LIMIT: 'The daily Gemini limit for this app was reached.',
  GEMINI_UNAVAILABLE: 'Gemini was not available.',
  GEMINI_TIMEOUT: 'Gemini took too long.',
  GEMINI_BAD_RESPONSE: 'Gemini’s answer could not be used.',
  UNVERIFIED_NUMBERS: 'Gemini’s answer contained numbers that were not verified, so it was not used.',
  INSUFFICIENT_DATA: 'There was too little data for a longer explanation.',
};

/** Allergen warnings come first and stay separate from the number: a high score never hides them. */
export function AllergenPanel({ match }) {
  const { allergens, allergenPenalty: penalty } = match;
  const rows = penalty.items;
  const clean = rows.length === 0 && allergens.status === 'complete' && allergens.possible.length === 0;
  return (
    <section className={`allergen-panel${penalty.hasConfirmedConflict ? ' is-conflict' : rows.length || allergens.status !== 'complete' ? ' is-caution' : ''}`} aria-labelledby="allergen-title">
      <h2 id="allergen-title" className="allergen-panel__title">
        <Icon name={penalty.hasConfirmedConflict ? 'x' : clean ? 'check' : 'alert'} size={22} />
        Allergen check
        <span className="badge">{STATUS_TEXT[allergens.status]} information</span>
      </h2>
      {penalty.hasConfirmedConflict && <p className="allergen-panel__lead"><strong>This product conflicts with your saved allergens.</strong> A high score never overrides this.</p>}
      {rows.length > 0 && (
        <ul className="allergen-list">
          {rows.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong> <span className={`badge badge--${item.tier}`}>{TIER_TEXT[item.tier]}</span>
              <span> −{item.points} points</span>
              <small>{allergens.detected.find((d) => d.id === item.id)?.sources.join(' · ')}</small>
            </li>
          ))}
        </ul>
      )}
      {allergens.possible.length > 0 && (
        <p className="allergen-panel__note"><strong>Possible ingredient-derived concern (no points deducted):</strong> {allergens.possible.map((p) => `${p.label} (${p.sources.join(', ')})`).join('; ')}. The source of the ingredient is not stated, so check with the maker.</p>
      )}
      {allergens.status !== 'complete' && (
        <p className="allergen-panel__note"><strong>Safety could not be established.</strong> {allergens.reason}{penalty.incompletePoints ? ` −${penalty.incompletePoints} points.` : ''} Check the printed label.</p>
      )}
      {clean && <p className="allergen-panel__note">No allergen matching your saved allergens was found in the information provided. Always check the printed label as well.</p>}
      {rows.length === 0 && !clean && !allergens.hasSavedAllergens && <p className="allergen-panel__note">You have not saved any allergens, so nothing was matched. Add them in Preferences.</p>}
      {allergens.detected.some((d) => !d.matchesUser && d.tier !== 'possible') && (
        <p className="allergen-panel__note">Also present, not in your saved allergens: {allergens.detected.filter((d) => !d.matchesUser && d.tier !== 'possible').map((d) => `${d.label} (${TIER_TEXT[d.tier].toLowerCase()})`).join(', ')}.</p>
      )}
    </section>
  );
}

function Breakdown({ match }) {
  const names = Object.keys(match.components);
  return (
    <details className="more" aria-labelledby="breakdown-title">
      <summary id="breakdown-title">How the score was calculated</summary>
      <p className="nl-field__hint">Score = Personal Preference × 0.50 + Nutrition Quality × 0.30 + Ingredients × 0.20, then allergen penalties. These numbers are calculated by NutriLens, never by AI.</p>
      <div className="table-wrap">
        <table className="result-table">
          <thead><tr><th scope="col">Part</th><th scope="col">Score</th><th scope="col">Weight</th><th scope="col">Points</th></tr></thead>
          <tbody>
            {names.map((key) => {
              const c = match.components[key];
              return (
                <tr key={key}>
                  <th scope="row">{COMPONENT_NAMES[key]}</th>
                  <td>{c.score === null ? 'Not available' : fmt(c.score)}</td>
                  <td>{c.score === null ? '—' : `${Math.round(c.weightUsed * 100)}%`}</td>
                  <td>{c.contribution === null ? '—' : fmt(c.contribution)}</td>
                </tr>
              );
            })}
            <tr className="result-table__sum"><th scope="row">Base score</th><td colSpan={2} /><td>{match.baseScore === null ? '—' : fmt(match.baseScore)}</td></tr>
            {match.allergenPenalty.items.map((item) => (
              <tr key={item.id} className="result-table__penalty"><th scope="row">{item.label} ({TIER_TEXT[item.tier].toLowerCase()})</th><td colSpan={2} /><td>−{item.points}</td></tr>
            ))}
            {match.allergenPenalty.incompletePoints > 0 && <tr className="result-table__penalty"><th scope="row">Allergen information incomplete</th><td colSpan={2} /><td>−{match.allergenPenalty.incompletePoints}</td></tr>}
            {match.allergenPenalty.capApplied && <tr><th scope="row">Penalty cap (maximum 60)</th><td colSpan={2} /><td>total −{match.allergenPenalty.total}</td></tr>}
            {match.allergenPenalty.ceilingApplied && <tr><th scope="row">Confirmed allergen ceiling</th><td colSpan={2} /><td>at most {match.allergenPenalty.ceiling}</td></tr>}
            <tr className="result-table__sum"><th scope="row">Final score</th><td colSpan={2} /><td><strong>{match.finalScore === null ? '—' : match.finalScore}</strong></td></tr>
          </tbody>
        </table>
      </div>
      {match.components.preference.weightUsed !== match.components.preference.nominalWeight && match.finalScore !== null && <p className="nl-field__hint">Some parts were not available, so the weights were scaled to add up to 100%.</p>}
    </details>
  );
}

function NutrientTable({ analysis }) {
  const { nutrients, match, label } = analysis;
  const prefs = Object.fromEntries(match.details.preference.items.map((i) => [i.nutrient, i]));
  const quality = Object.fromEntries(match.details.quality.items.map((i) => [i.nutrient, i]));
  return (
    <details className="more" aria-labelledby="nutrient-title">
      <summary id="nutrient-title">Full nutrient table (per 100 {label.per100Unit})</summary>
      <p className="nl-field__hint">Low / medium / high use project-defined limits, not medical or official classifications.</p>
      <div className="table-wrap">
        <table className="result-table">
          <thead><tr><th scope="col">Nutrient</th><th scope="col">Value</th><th scope="col">Level</th><th scope="col">Limits (low / medium)</th><th scope="col">Your goal</th><th scope="col">Quality score</th></tr></thead>
          <tbody>
            {Object.values(nutrients).map((n) => {
              const p = prefs[n.nutrient];
              return (
                <tr key={n.nutrient}>
                  <th scope="row">{n.label}{!n.scored && <small> (info only)</small>}</th>
                  <td>{n.value === null ? <em>not available</em> : `${fmt(n.value)} ${n.unit}`}</td>
                  <td>{n.level ? <span className={`level level--${n.level.toLowerCase()}`}>{LEVEL_TEXT[n.level]}</span> : '—'}</td>
                  <td>≤ {n.low} / ≤ {n.medium} {n.unit}</td>
                  <td>{p ? `${p.goal === 'lower' ? 'Lower' : 'Higher'}, importance ${p.weight}: ${p.score}` : '—'}</td>
                  <td>{quality[n.nutrient] ? `${quality[n.nutrient].score} (${quality[n.nutrient].direction === 'lower' ? 'lower' : 'higher'} is better)` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {match.details.preference.missing.length > 0 && <p className="nl-field__hint">Missing for your goals (not treated as zero): {match.details.preference.missing.join(', ')}.</p>}
      {analysis.label.per100g && analysis.per100Source && Object.values(analysis.per100Source).includes('converted_from_serving') && <p className="nl-field__hint">Some values were converted from per serving to per 100 using V100 = (Vs ÷ serving size) × 100.</p>}
    </details>
  );
}


const BAND = (score) => (score === null || score === undefined ? 'No score' : score >= 70 ? 'Strong match' : score >= 50 ? 'Fair match' : 'Weak match');

function summarySentence(match) {
  if (match.finalScore === null) return 'There is too little nutrition data to calculate a score.';
  if (match.allergenPenalty.hasConfirmedConflict) return 'This product contains an allergen you avoid, so the score is capped. Read the allergen warning first.';
  if (match.finalScore >= 70) return 'This product fits your preferences well.';
  if (match.finalScore >= 50) return 'This product is a fair fit. Some things don’t line up with your goals.';
  return 'This product doesn’t fit your goals well.';
}

function ScoreCard({ name, score, hint }) {
  const tone = scoreTone(score);
  return (
    <div className="mini-score">
      <div className="mini-score__top"><span>{name}</span><strong>{score === null || score === undefined ? '—' : Math.round(score)}</strong></div>
      <div className="meter" role="img" aria-label={score === null || score === undefined ? `${name}: not available` : `${name} ${Math.round(score)} out of 100`}>
        <span className={`meter__fill meter__fill--${tone}`} style={{ width: `${score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <small>{hint}</small>
    </div>
  );
}

function ScoreHeader({ analysis, title }) {
  const { match, label } = analysis;
  const tone = scoreTone(match.finalScore);
  const c = match.components;
  return (
    <header className="result-hero">
      <div className="result-hero__main">
        <div className={`score-ring score-ring--${tone}`} role="img" aria-label={match.finalScore === null ? 'No Personal Match Score' : `Personal Match Score ${match.finalScore} out of 100`}>
          <span className="score-ring__value">{match.finalScore === null ? '—' : match.finalScore}</span>
          <span className="score-ring__of">{match.finalScore === null ? 'no score' : 'out of 100'}</span>
        </div>
        <div className="result-hero__text">
          <p className="nl-eyebrow">Personal Match Score</p>
          <h1 className="result-hero__title">{title ?? label.productName ?? 'Unnamed product'}</h1>
          {label.brand && <p className="result-head__brand">{label.brand}</p>}
          <p className={`result-hero__band result-hero__band--${tone}`}>{BAND(match.finalScore)}</p>
          <p className="result-hero__sum">{summarySentence(match)}</p>
          {match.status === 'partial' && <p className="badge badge--warn badge--flush">Partial data: see limitations</p>}
        </div>
      </div>
      <div className="mini-scores">
        <ScoreCard name="Your preferences" score={c.preference.score} hint="How well it fits your goals" />
        <ScoreCard name="Nutrition quality" score={c.quality.score} hint="Overall nutritional balance" />
        <ScoreCard name="Ingredient score" score={c.ingredient.score} hint="What the ingredient list says" />
      </div>
    </header>
  );
}

const GOOD_WHEN_HIGH = new Set(['protein', 'fibre']);

function NutrientGrid({ analysis }) {
  const { nutrients, label, match } = analysis;
  const dir = Object.fromEntries(match.details.quality.items.map((i) => [i.nutrient, i.direction]));
  const items = Object.values(nutrients).filter((n) => n.value !== null || n.scored);
  return (
    <section className="result-card" aria-labelledby="nutrient-grid-title">
      <h2 id="nutrient-grid-title" className="result-card__title">Nutrition at a glance</h2>
      <p className="nl-field__hint">Per 100 {label.per100Unit}. Low, medium and high use NutriLens limits, not medical classifications.</p>
      <ul className="nutrient-grid">
        {items.map((n) => {
          const goodHigh = GOOD_WHEN_HIGH.has(n.nutrient) || dir[n.nutrient] === 'higher';
          const lvl = n.level ? n.level.toLowerCase() : null;
          const tone = !lvl ? 'none' : goodHigh ? (lvl === 'high' ? 'good' : lvl === 'low' ? 'poor' : 'fair') : (lvl === 'low' ? 'good' : lvl === 'medium' ? 'fair' : 'poor');
          const pct = n.value === null ? 0 : Math.min(100, (n.value / (n.medium * 1.5 || 1)) * 100);
          return (
            <li key={n.nutrient} className="nutrient">
              <div className="nutrient__top">
                <span className="nutrient__name">{n.label}</span>
                {n.level && <span className={`level-pill level-pill--${tone}`}>{LEVEL_TEXT[n.level]}</span>}
              </div>
              <p className="nutrient__value">{n.value === null ? <em>not available</em> : <>{fmt(n.value)}<small> {n.unit}</small></>}</p>
              <div className="meter meter--thin" aria-hidden="true"><span className={`meter__fill meter__fill--${tone}`} style={{ width: `${pct}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function IngredientCard({ match }) {
  const ing = match.details.ingredient;
  return (
    <section className="result-card" aria-labelledby="ingredient-title">
      <h2 id="ingredient-title" className="result-card__title">Ingredient analysis {ing.score !== null && <span className="badge">score {fmt(ing.score)}</span>}</h2>
      {!ing.applicable && <p>No ingredient list was available, so ingredients were not scored.</p>}
      {ing.applicable && ing.findings.length === 0 && <p>Nothing in the ingredient list stood out, so the ingredient score stays neutral.</p>}
      {ing.findings.length > 0 && (
        <ul className="finding-list">
          {ing.findings.map((f, index) => (
            <li key={`${f.rule}-${index}`} className={`finding finding--${f.points > 0 ? 'good' : 'bad'}`}>
              <span className="finding__points">{f.points > 0 ? '+' : ''}{f.points}</span>
              <span>{f.message}</span>
            </li>
          ))}
        </ul>
      )}
      {ing.dietConflicts.length > 0 && <p className="nl-alert"><Icon name="alert" size={20} /><span><strong>Dietary preference:</strong> {ing.dietConflicts.map((c) => c.message).join(' ')}</span></p>}
    </section>
  );
}

function Explanation({ explanation }) {
  if (!explanation) return null;
  const { source, fallbackReason, content: e } = explanation;
  const recs = [...e.suggestions.map((t) => ({ t, kind: 'tip' })), ...e.cautions.map((t) => ({ t, kind: 'care' }))];
  return (
    <>
      <section className="result-card explain" aria-labelledby="explain-title">
        <h2 id="explain-title" className="result-card__title">Explanation <span className={`badge ${source === 'gemini' ? 'badge--ai' : ''}`}>{source === 'gemini' ? 'Written by Gemini from the calculated results' : 'Basic explanation'}</span></h2>
        {source !== 'gemini' && fallbackReason && <p className="nl-field__hint">{FALLBACK_TEXT[fallbackReason] ?? 'Gemini was not used.'} This text is built directly from the calculated results.</p>}
        <p className="explain__lead">{e.overview}</p>
        <h3>Nutrition</h3>
        <p>{e.nutritionExplanation}</p>
        {e.nutrientLevels.length > 0 && (
          <details className="explain__details">
            <summary>How each nutrient level was decided</summary>
            <ul>{e.nutrientLevels.map((l) => <li key={l.nutrient}><strong>{l.nutrient}:</strong> {l.text}</li>)}</ul>
          </details>
        )}
        <h3>Ingredients</h3>
        <p>{e.ingredientExplanation}</p>
        <h3>Allergens</h3>
        <ul>{e.allergenWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        <h3>Your Personal Match Score</h3>
        <p>{e.personalMatchExplanation}</p>
        {(e.advantages.length > 0 || e.disadvantages.length > 0) && (
          <div className="explain__cols">
            {e.advantages.length > 0 && <div className="pros"><h3>What works</h3><ul>{e.advantages.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {e.disadvantages.length > 0 && <div className="cons"><h3>What doesn’t</h3><ul>{e.disadvantages.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          </div>
        )}
      </section>
      {recs.length > 0 && (
        <section className="result-card" aria-labelledby="recs-title">
          <h2 id="recs-title" className="result-card__title">Recommendations</h2>
          <ul className="rec-list">
            {recs.map((r, i) => (
              <li key={i} className={`rec rec--${r.kind}`}><Icon name={r.kind === 'tip' ? 'leaf' : 'alert'} size={20} /><span>{r.t}</span></li>
            ))}
          </ul>
        </section>
      )}
      <p className="disclaimer">Not medical advice. Check the printed label, especially if you have an allergy.</p>
    </>
  );
}

/** The complete result: score summary, allergens, nutrition, ingredients, explanation and recommendations. */
export default function AnalysisView({ analysis, explanation, title, children }) {
  const { match } = analysis;
  return (
    <div className="result">
      <ScoreHeader analysis={analysis} title={title} />
      <AllergenPanel match={match} />
      {children}
      {match.limitations.length > 0 && (
        <section className="result-card result-card--limits" aria-labelledby="limits-title">
          <h2 id="limits-title" className="result-card__title">Limitations of this result</h2>
          <ul className="muted-list">{match.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      )}
      <NutrientGrid analysis={analysis} />
      <IngredientCard match={match} />
      <Explanation explanation={explanation} />
      <div className="more-wrap">
        <Breakdown match={match} />
        <NutrientTable analysis={analysis} />
      </div>
    </div>
  );
}
