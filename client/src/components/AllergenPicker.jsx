import { useId } from 'react';
import Icon from './Icon.jsx';

/** Predefined allergens as toggle chips, plus "Other" for a few custom entries. */
export default function AllergenPicker({
  options,
  form,
  errors,
  onToggle,
  onOtherToggle,
  onDraftChange,
  onAddCustom,
  onRemoveCustom,
}) {
  const id = useId();
  const { maxEntries } = options.customAllergens;
  const draftId = `${id}-draft`;
  const atLimit = form.customAllergens.length >= maxEntries;

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // Enter adds the entry; it must not submit the whole form
      onAddCustom();
    }
  }

  return (
    <fieldset className="nl-choice allergen-picker" data-invalid={errors.allergens ? 'true' : undefined}>
      <legend className="nl-choice__legend">Allergens to avoid</legend>
      <p className="nl-field__hint">Tick everything that applies. Leave all unticked if none do.</p>

      <div className="nl-chipgroup">
        {options.allergens.map((allergen) => (
          <label className="nl-chipcheck" key={allergen.key}>
            <input type="checkbox" checked={form.allergens.includes(allergen.key)} onChange={() => onToggle(allergen.key)} />
            <span>
              <Icon name="check" size={16} />
              {allergen.label}
            </span>
          </label>
        ))}
        <label className="nl-chipcheck">
          <input type="checkbox" checked={form.otherOpen} onChange={(event) => onOtherToggle(event.target.checked)} />
          <span>
            <Icon name="check" size={16} />
            Other
          </span>
        </label>
      </div>

      {errors.allergens && (
        <p className="nl-field__error">
          <Icon name="alert" size={16} />
          {errors.allergens}
        </p>
      )}

      {form.otherOpen && (
        <div className="allergen-other">
          <div className={`nl-field${errors.customDraft ? ' has-error' : ''}`}>
            <label className="nl-field__label" htmlFor={draftId}>
              Other allergen
            </label>
            <div className="allergen-other__row">
              <input
                id={draftId}
                className="nl-input"
                value={form.customDraft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                disabled={atLimit}
                aria-invalid={errors.customDraft ? 'true' : undefined}
                aria-describedby={`${draftId}-hint${errors.customDraft ? ` ${draftId}-error` : ''}`}
              />
              <button type="button" className="nl-btn nl-btn--secondary" onClick={onAddCustom} disabled={atLimit}>
                Add
              </button>
            </div>
            <p id={`${draftId}-hint`} className="nl-field__hint">
              {form.customAllergens.length} of {maxEntries} added. NutriLens looks for the exact words you enter.
            </p>
            {errors.customDraft && (
              <p id={`${draftId}-error`} className="nl-field__error">
                <Icon name="alert" size={16} />
                {errors.customDraft}
              </p>
            )}
          </div>

          {errors.customAllergens && (
            <p className="nl-field__error">
              <Icon name="alert" size={16} />
              {errors.customAllergens}
            </p>
          )}

          {form.customAllergens.length > 0 && (
            <ul className="allergen-other__list" aria-label="Other allergens you added">
              {form.customAllergens.map((entry, index) => (
                <li key={`${entry}-${index}`}>
                  <span className="nl-tag" data-invalid={errors[`customAllergens.${index}`] ? 'true' : undefined}>
                    {entry}
                    <button type="button" className="nl-tag__remove" onClick={() => onRemoveCustom(index)} aria-label={`Remove ${entry}`}>
                      <Icon name="x" size={16} />
                    </button>
                  </span>
                  {errors[`customAllergens.${index}`] && (
                    <p className="nl-field__error">
                      <Icon name="alert" size={16} />
                      {errors[`customAllergens.${index}`]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  );
}
