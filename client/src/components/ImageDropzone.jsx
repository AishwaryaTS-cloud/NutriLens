import { useId, useState } from 'react';
import Icon from './Icon.jsx';

/**
 * Choose or drop one image. The real file input stays in the page (visually hidden), so it works
 * with the keyboard and screen readers; the label is the visible button.
 */
export default function ImageDropzone({ onFile, maxUploadMb, allowedTypes, disabled = false }) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function pick(fileList) {
    const file = fileList?.[0];
    if (file && !disabled) onFile(file);
  }

  return (
    <div
      className={`dropzone${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        pick(event.dataTransfer.files);
      }}
    >
      <Icon name="arrow" size={28} className="dropzone__icon" />
      <p className="dropzone__title">Drop a photo of the label here</p>
      <p className="dropzone__hint">or choose one from your device. JPG, PNG or WebP, up to {maxUploadMb} MB.</p>

      <input
        id={inputId}
        className="dropzone__input"
        type="file"
        accept={allowedTypes.join(',')}
        disabled={disabled}
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = ''; // choosing the same file again should still register
        }}
      />
      <label htmlFor={inputId} className="nl-btn nl-btn--primary dropzone__button">
        Choose an image
      </label>

      <ul className="dropzone__tips">
        <li>Good light, with no glare on glossy packaging</li>
        <li>Hold the camera straight on, with the label flat and filling the frame</li>
        <li>Make sure the small print is sharp before you take the photo</li>
      </ul>
    </div>
  );
}
