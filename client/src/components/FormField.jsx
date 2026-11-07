import { useId, useState } from 'react';
import Icon from './Icon.jsx';

/** Labelled input with hint, inline error and (for passwords) a show/hide toggle. */
export default function FormField({ label, type = 'text', error, hint, ...inputProps }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`nl-field${error ? ' has-error' : ''}`}>
      <label className="nl-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="nl-field__control">
        <input
          id={id}
          className="nl-input"
          type={isPassword && visible ? 'text' : type}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            className="nl-field__toggle"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
          >
            <Icon name={visible ? 'eye-off' : 'eye'} size={20} />
          </button>
        )}
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
    </div>
  );
}
