import { useId } from 'react';
import Icon from './Icon.jsx';

/** A single-choice group built from real radio inputs (keyboard and screen-reader friendly). */
export default function ChoiceGroup({ legend, name, options, value, onChange, error, hint, hideLegend = false }) {
  const id = useId();
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <fieldset
      className={`nl-choice${error ? ' has-error' : ''}`}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      data-invalid={error ? 'true' : undefined}
    >
      <legend className={`nl-choice__legend${hideLegend ? ' sr-only' : ''}`}>{legend}</legend>
      <div className="nl-choice__options">
        {options.map((option) => (
          <label className="nl-choice__option" key={String(option.value)}>
            <input
              type="radio"
              name={`${id}-${name}`}
              value={String(option.value)}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {hintId && (
        <p id={hintId} className="nl-field__hint">
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} className="nl-field__error">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </fieldset>
  );
}
