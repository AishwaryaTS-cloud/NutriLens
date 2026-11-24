import { useRef } from 'react';
import { OTP_LENGTH, backspaceCode, editCode, sanitizeCode } from '../hooks/otp.js';

/**
 * Six single-digit boxes that behave like one field: typing advances, Backspace steps back, arrow
 * keys move, and pasting (or a phone autofilling "one-time-code") fills all six at once.
 */
export default function OtpInput({ value, onChange, disabled = false, invalid = false, autoFocus = false, labelId }) {
  const boxes = useRef([]);
  const focusBox = (index) => boxes.current[index]?.focus();

  function handleChange(index, event) {
    const next = editCode(value, index, event.target.value);
    onChange(next.code);
    focusBox(next.focus);
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !value[index]) {
      event.preventDefault();
      const next = backspaceCode(value, index);
      onChange(next.code);
      focusBox(next.focus);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function handlePaste(event) {
    const digits = sanitizeCode(event.clipboardData.getData('text'));
    if (!digits) return;
    event.preventDefault();
    onChange(digits);
    focusBox(Math.min(digits.length, OTP_LENGTH - 1));
  }

  return (
    <div className="otp" role="group" aria-labelledby={labelId}>
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => { boxes.current[index] = element; }}
          className={`otp__box${invalid ? ' is-invalid' : ''}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={value[index] ?? ''}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
