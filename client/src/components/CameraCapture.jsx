import { useEffect, useRef, useState } from 'react';
import { createCameraController, initialCameraState } from '../hooks/camera.js';
import Icon from './Icon.jsx';

/**
 * Take a photo of the label with the device camera, inside the page.
 * All camera work lives in hooks/camera.js; this component only shows its state. The controller is
 * created and disposed in an effect, so the camera is stopped when this component unmounts (including
 * React StrictMode's extra mount in development). `onUse(file)` receives a JPEG File, which the Scan
 * page handles exactly like an uploaded file.
 */
export default function CameraCapture({ onUse, onCancel, maxBytes }) {
  const [view, setView] = useState(initialCameraState);
  const [ratio, setRatio] = useState(4 / 3);
  const [ready, setReady] = useState(false);
  const controllerRef = useRef(null);
  const videoRef = useRef(null);
  const primaryRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const maxBytesRef = useRef(maxBytes);
  maxBytesRef.current = maxBytes; // read when a photo is taken, so a late options response never restarts the camera

  useEffect(() => {
    const controller = createCameraController({ maxBytes: () => maxBytesRef.current, onState: setView });
    controllerRef.current = controller;
    controller.start();
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Connect the stream to the <video> element, and disconnect it when the stream goes away.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    setReady(false);
    if (view.stream) {
      video.srcObject = view.stream;
      video.play?.().catch(() => {}); // autoplay can be refused; the user can still press Capture
    } else {
      video.srcObject = null;
    }
    return () => {
      video.srcObject = null;
    };
  }, [view.stream]);

  // Preview of the captured photo (revoked as soon as it is replaced or this unmounts).
  useEffect(() => {
    if (!view.photo) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(view.photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [view.photo]);

  useEffect(() => {
    if (view.phase === 'live' && ready) primaryRef.current?.focus();
    if (view.phase === 'captured' || view.phase === 'error') primaryRef.current?.focus();
  }, [view.phase, ready]);

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  function onMetadata(event) {
    const { videoWidth, videoHeight } = event.currentTarget;
    if (videoWidth && videoHeight) setRatio(videoWidth / videoHeight);
    setReady(true);
  }

  const { phase, error } = view;
  const showVideo = phase === 'starting' || phase === 'live';

  return (
    <div className="camera" role="group" aria-label="Camera" onKeyDown={onKeyDown}>
      <div className="camera__stage" style={{ aspectRatio: String(ratio) }} hidden={phase === 'error'}>
        {/* The video element stays mounted so the stream attaches reliably; it is hidden when not in use. */}
        <video
          ref={videoRef}
          className="camera__video"
          autoPlay
          playsInline
          muted
          hidden={!showVideo}
          onLoadedMetadata={onMetadata}
          aria-label="Live camera preview"
        />
        {phase === 'captured' && previewUrl && <img className="camera__photo" src={previewUrl} alt="The photo you just took" />}
        {phase === 'starting' && (
          <p className="camera__status" role="status">
            <Icon name="loader" size={22} className="nl-spin" /> Waiting for camera permission…
          </p>
        )}
        {phase === 'live' && !ready && (
          <p className="camera__status" role="status">
            <Icon name="loader" size={22} className="nl-spin" /> Starting the camera…
          </p>
        )}
        {phase === 'live' && ready && <span className="camera__frame" aria-hidden="true" />}
      </div>

      {phase === 'error' && error && (
        <p className="nl-alert" role="alert">
          <Icon name="alert" size={20} />
          <span>{error.message}</span>
        </p>
      )}

      {(phase === 'starting' || phase === 'live') && (
        <p className="nl-field__hint camera__hint">Hold the camera straight on, with the label flat and the small print sharp.</p>
      )}

      <div className="camera__actions">
        {(phase === 'starting' || phase === 'live') && (
          <button
            ref={primaryRef}
            type="button"
            className="nl-btn nl-btn--primary camera__capture"
            disabled={phase !== 'live' || !ready}
            onClick={() => controllerRef.current?.capture(videoRef.current)}
          >
            <Icon name="camera" size={18} /> Capture Photo
          </button>
        )}
        {phase === 'captured' && (
          <>
            <button ref={primaryRef} type="button" className="nl-btn nl-btn--primary" onClick={() => onUse(view.photo)}>
              <Icon name="check" size={18} /> Use Photo
            </button>
            <button type="button" className="nl-btn nl-btn--outline" onClick={() => controllerRef.current?.retake()}>
              <Icon name="refresh" size={18} /> Retake
            </button>
          </>
        )}
        {phase === 'error' && error?.canRetry && (
          <button ref={primaryRef} type="button" className="nl-btn nl-btn--primary" onClick={() => controllerRef.current?.retake()}>
            <Icon name="refresh" size={18} /> Try again
          </button>
        )}
        <button
          ref={phase === 'error' && !error?.canRetry ? primaryRef : undefined}
          type="button"
          className={phase === 'error' && !error?.canRetry ? 'nl-btn nl-btn--primary' : 'nl-btn nl-btn--ghost'}
          onClick={onCancel}
        >
          {phase === 'error' ? 'Back to upload' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
