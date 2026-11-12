import { useId } from 'react';
import Icon from './Icon.jsx';
import { DIET_MARKS, NUTRIENT_ROWS, issuesByField } from '../hooks/labelForm.js';

const FIELD_LABELS = { 'per100g.sodium': 'sodium (per 100)', 'ingredientsText': 'ingredients', 'servingSize': 'serving size' };
const fieldName = (name) => FIELD_LABELS[name] ?? name.replace(/^(per100g|perServing)\./, '').replace(/([A-Z])/g, ' $1').toLowerCase();

/** Readability summary from Gemini: what could not be read or is uncertain. Never implies the data is correct. */
function ExtractionNotes({ extraction }) {
  if (!extraction) {
    return <p className="nl-field__hint">You are entering the label by hand. Leave a field empty if the label does not show it. Empty is not the same as zero.</p>;
  }
  const { status, readability, columnsFound, isFoodLabel } = extraction;
  const unreadable = readability?.unreadableFields ?? [];
  const uncertain = readability?.uncertainFields ?? [];
  const notes = readability?.notes ?? [];
  if (isFoodLabel === false || status === 'empty') {
    return (
      <p className="nl-alert" role="alert">
        <Icon name="alert" size={20} />
        <span>Gemini could not find a food label or any readable values in this image. Try a clearer photo, or fill the fields in by hand.</span>
      </p>
    );
  }
  return (
    <div className={`extract-note extract-note--${status}`} role="status">
      <p className="extract-note__title">
        <Icon name={status === 'ok' ? 'check' : 'alert'} size={20} />
        {status === 'ok' ? 'Gemini read the label. Please check every value against the package.' : 'Gemini read part of the label. Please check and complete the fields below.'}
      </p>
      <ul>
        {readability?.imageQuality && <li>Image quality: {readability.imageQuality}.</li>}
        {columnsFound.length > 0 && <li>Columns found: {columnsFound.join(', ')}.</li>}
        {unreadable.length > 0 && <li>Could not read: {unreadable.join(', ')}. These are left empty.</li>}
        {uncertain.length > 0 && <li>Not sure about: {uncertain.join(', ')}.</li>}
        {notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </div>
  );
}

function IssueList({ issues }) {
  if (!issues?.length) return null;
  return (
    <ul className="issue-list" aria-label="Things to check">
      {issues.map((issue, index) => (
        <li key={`${issue.field}-${issue.code}-${index}`} className={`issue issue--${issue.severity}`}>
          <Icon name={issue.severity === 'error' ? 'x' : 'alert'} size={18} />
          <span><strong>{fieldName(issue.field)}:</strong> {issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LabelReviewForm({ form, onChange, issues, extraction, previewUrl, busy, onAnalyse, onStartOver }) {
  const uid = useId();
  const byField = issuesByField(issues);
  const set = (patch) => onChange({ ...form, ...patch });
  const setCell = (column, key, value) => onChange({ ...form, [column]: { ...form[column], [key]: value } });
  const cellProps = (column, key) => {
    const problems = byField[`${column === 'per100g' ? 'per100g' : 'perServing'}.${key}`] ?? [];
    return { problems, has: problems.some((p) => p.severity === 'error') };
  };
  const unit = form.servingUnit === 'ml' ? 'ml' : 'g';
  const errorCount = (issues ?? []).filter((i) => i.severity === 'error').length;

  return (
    <form className="review" onSubmit={(event) => { event.preventDefault(); onAnalyse(); }} noValidate>
      <div className="review__side">
        {previewUrl && (
          <figure className="review__figure">
            <img src={previewUrl} alt="The label image you uploaded" />
            <figcaption>Compare each value with this image.</figcaption>
          </figure>
        )}
        <ExtractionNotes extraction={extraction} />
        <IssueList issues={issues} />
      </div>

      <div className="review__main">
        <section className="review__section">
          <h2 className="review__heading">Product</h2>
          <div className="review__grid">
            <label className="nl-field" htmlFor={`${uid}-name`}>
              <span className="nl-field__label">Product name</span>
              <input id={`${uid}-name`} className="nl-input" value={form.productName} maxLength={120} onChange={(e) => set({ productName: e.target.value })} />
            </label>
            <label className="nl-field" htmlFor={`${uid}-brand`}>
              <span className="nl-field__label">Brand</span>
              <input id={`${uid}-brand`} className="nl-input" value={form.brand} maxLength={120} onChange={(e) => set({ brand: e.target.value })} />
            </label>
            <div className={`nl-field${byField['servingSize.value'] ? ' has-error' : ''}`}>
              <label className="nl-field__label" htmlFor={`${uid}-serving`}>Serving size</label>
              <div className="review__serving">
                <input id={`${uid}-serving`} className="nl-input" inputMode="decimal" value={form.servingValue} onChange={(e) => set({ servingValue: e.target.value })} aria-label="Serving size amount" />
                <select className="nl-input" value={form.servingUnit} onChange={(e) => set({ servingUnit: e.target.value })} aria-label="Serving size unit">
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="review__section">
          <h2 className="review__heading">Nutrition</h2>
          <p className="nl-field__hint">Type the numbers as printed. Fill in the per-100 column, the per-serving column, or both. Leave a box empty if the label does not show it.</p>
          <div className="review__table-wrap">
            <table className="review__table">
              <thead>
                <tr>
                  <th scope="col">Nutrient</th>
                  <th scope="col">Per 100 {unit}</th>
                  <th scope="col">Per serving</th>
                </tr>
              </thead>
              <tbody>
                {NUTRIENT_ROWS.map(({ key, label, unit: u }) => {
                  const a = cellProps('per100g', key);
                  const b = cellProps('perServing', key);
                  return (
                    <tr key={key}>
                      <th scope="row">{label} <span className="review__unit">({u})</span></th>
                      <td>
                        <input className={`nl-input review__cell${a.has ? ' is-invalid' : ''}`} inputMode="decimal" value={form.per100g[key]} onChange={(e) => setCell('per100g', key, e.target.value)} aria-label={`${label} per 100 ${unit}, in ${u}`} aria-invalid={a.has} />
                      </td>
                      <td>
                        <input className={`nl-input review__cell${b.has ? ' is-invalid' : ''}`} inputMode="decimal" value={form.perServing[key]} onChange={(e) => setCell('perServing', key, e.target.value)} aria-label={`${label} per serving, in ${u}`} aria-invalid={b.has} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="review__section">
          <h2 className="review__heading">Ingredients and allergens</h2>
          <label className="nl-field" htmlFor={`${uid}-ing`}>
            <span className="nl-field__label">Ingredients (without the “Contains / May contain” sentences)</span>
            <textarea id={`${uid}-ing`} className="nl-input review__textarea" rows={4} maxLength={4000} value={form.ingredientsText} onChange={(e) => set({ ingredientsText: e.target.value })} />
          </label>
          <div className="review__grid">
            <label className="nl-field" htmlFor={`${uid}-contains`}>
              <span className="nl-field__label">Contains (declared allergens)</span>
              <input id={`${uid}-contains`} className="nl-input" value={form.contains} placeholder="e.g. Wheat, Milk" onChange={(e) => set({ contains: e.target.value })} />
            </label>
            <label className="nl-field" htmlFor={`${uid}-may`}>
              <span className="nl-field__label">May contain (cross-contamination)</span>
              <input id={`${uid}-may`} className="nl-input" value={form.mayContain} placeholder="e.g. Peanuts, Tree nuts" onChange={(e) => set({ mayContain: e.target.value })} />
            </label>
            <label className="nl-field" htmlFor={`${uid}-complete`}>
              <span className="nl-field__label">Is the ingredient list and allergen information complete?</span>
              <select id={`${uid}-complete`} className="nl-input" value={form.allergenComplete} onChange={(e) => set({ allergenComplete: e.target.value })}>
                <option value="unknown">I am not sure</option>
                <option value="yes">Yes, I can see all of it on the label</option>
                <option value="no">No, part of it is missing or unreadable</option>
              </select>
              <span className="nl-field__hint">Only “Yes” lets NutriLens treat the allergen check as complete.</span>
            </label>
            <label className="nl-field" htmlFor={`${uid}-mark`}>
              <span className="nl-field__label">Veg / non-veg mark</span>
              <select id={`${uid}-mark`} className="nl-input" value={form.foodTypeMark} onChange={(e) => set({ foodTypeMark: e.target.value })}>
                {DIET_MARKS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          </div>
        </section>

        {errorCount > 0 && <p className="nl-alert" role="alert"><Icon name="alert" size={20} /><span>{errorCount === 1 ? 'One value needs fixing' : `${errorCount} values need fixing`} before the analysis can run. See the list on the left.</span></p>}

        <div className="review__actions">
          <button type="submit" className="nl-btn nl-btn--primary" disabled={busy}>
            {busy ? <><Icon name="loader" size={18} className="nl-spin" /> Analysing…</> : 'Confirm and analyse'}
          </button>
          <button type="button" className="nl-btn nl-btn--ghost" onClick={onStartOver} disabled={busy}>Start over</button>
        </div>
        <p className="nl-field__hint">Nothing is analysed until you confirm. Scores are guides based on your saved preferences, not medical advice.</p>
      </div>
    </form>
  );
}
