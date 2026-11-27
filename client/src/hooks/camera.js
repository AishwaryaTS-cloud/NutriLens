/**
 * Camera capture logic for the Scan page (no React, so it can be tested without a browser).
 *
 *   idle -> starting -> live -> captured -> (retake) -> starting ...
 *                 \        \________ (error) ________/
 *                  \-> error
 *
 * A captured photo is turned into an ordinary JPEG `File`. The Scan page then passes it to the same
 * `handleFile` / `validateImageFile` / `extractLabel` path an uploaded file takes, so nothing about
 * validation, the API request or the server changes. The camera is released (every track stopped)
 * as soon as a photo is taken, when the camera is closed and when the component unmounts.
 */

export const CAMERA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: {
    facingMode: { ideal: 'environment' }, // rear camera on phones; laptops fall back to the webcam
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
});

export const CAPTURE_LIMITS = Object.freeze({
  maxEdge: 2048, // same longest side the server resizes to, so nothing is sent that it would discard
  quality: 0.92,
  minQuality: 0.5,
  mimeType: 'image/jpeg',
});

export class CameraError extends Error {
  /** @param {string} code @param {string} message @param {boolean} canRetry */
  constructor(code, message, canRetry = true) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
    this.canRetry = canRetry;
  }
}

const MESSAGES = {
  UNSUPPORTED: ['This browser cannot open a camera here. Upload a photo instead.', false],
  INSECURE: ['Camera access needs a secure (HTTPS) connection. Upload a photo instead.', false],
  PERMISSION_DENIED: ['Camera access was blocked. Allow the camera for this site in your browser settings, then try again, or upload a photo instead.', true],
  NO_CAMERA: ['No camera was found on this device. Upload a photo instead.', false],
  IN_USE: ['The camera could not be started. It may be in use by another app or tab. Close it and try again.', true],
  DEVICE_LOST: ['The camera was disconnected or taken over by another app.', true],
  NOT_READY: ['The camera is not ready yet. Wait for the preview, then try again.', true],
  CAPTURE_FAILED: ['The photo could not be captured. Please try again.', true],
  UNKNOWN: ['The camera could not be started. Try again, or upload a photo instead.', true],
};

export function cameraError(code) {
  const [message, canRetry] = MESSAGES[code] ?? MESSAGES.UNKNOWN;
  return new CameraError(code, message, canRetry);
}

/** True when this browser exposes getUserMedia (it also needs a secure context; see classify below). */
export function isCameraSupported(mediaDevices = globalThis.navigator?.mediaDevices) {
  return typeof mediaDevices?.getUserMedia === 'function';
}

/** Maps whatever getUserMedia (or our own code) threw to a CameraError with a friendly message. */
export function classifyCameraError(err, { isSecureContext = true } = {}) {
  if (err instanceof CameraError) return err;
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return cameraError('PERMISSION_DENIED');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return cameraError('NO_CAMERA');
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return cameraError('IN_USE');
    case 'TypeError': // getUserMedia rejects with TypeError on insecure origins in some browsers
      return cameraError(isSecureContext ? 'UNKNOWN' : 'INSECURE');
    default:
      return cameraError('UNKNOWN');
  }
}

/** Stops every track of a stream. Safe to call with null or a stream that is already stopped. */
export function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // a track that cannot be stopped is already gone
    }
  }
}

/**
 * Asks for the camera. Prefers the rear camera, and retries with plain `video: true` if the browser
 * cannot satisfy those constraints. Rejects with a CameraError.
 */
export async function openCameraStream({ mediaDevices = globalThis.navigator?.mediaDevices, isSecureContext = globalThis.isSecureContext ?? true } = {}) {
  if (!isCameraSupported(mediaDevices)) throw cameraError(isSecureContext ? 'UNSUPPORTED' : 'INSECURE');
  try {
    return await mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  } catch (err) {
    if (err?.name !== 'OverconstrainedError' && err?.name !== 'TypeError') throw classifyCameraError(err, { isSecureContext });
    try {
      return await mediaDevices.getUserMedia({ audio: false, video: true });
    } catch (second) {
      throw classifyCameraError(second, { isSecureContext });
    }
  }
}

const pad = (n) => String(n).padStart(2, '0');

export function capturedFileName(date = new Date()) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `label-photo-${day}-${time}.jpg`;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), CAPTURE_LIMITS.mimeType, quality));
}

/**
 * Draws the current video frame to a canvas and returns it as a JPEG `File`.
 * Never larger than `maxEdge` on its longest side. If `maxBytes` is given, the quality (and then the
 * size) is lowered until the file fits, so the photo passes the same size limit as an upload.
 */
export async function captureFrame(video, { maxBytes, now = new Date(), createCanvas = () => document.createElement('canvas') } = {}) {
  const sourceWidth = video?.videoWidth;
  const sourceHeight = video?.videoHeight;
  if (!sourceWidth || !sourceHeight) throw cameraError('NOT_READY');

  let scale = Math.min(1, CAPTURE_LIMITS.maxEdge / Math.max(sourceWidth, sourceHeight));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw cameraError('CAPTURE_FAILED');
    context.drawImage(video, 0, 0, width, height);

    for (let quality = CAPTURE_LIMITS.quality; quality >= CAPTURE_LIMITS.minQuality - 1e-9; quality -= 0.14) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob || blob.size === 0) throw cameraError('CAPTURE_FAILED');
      if (!maxBytes || blob.size <= maxBytes) {
        return new File([blob], capturedFileName(now), { type: CAPTURE_LIMITS.mimeType, lastModified: now.getTime() });
      }
    }
    scale *= 0.75; // still too big at the lowest quality: shrink and try again
  }
  throw cameraError('CAPTURE_FAILED');
}

export const initialCameraState = Object.freeze({ phase: 'idle', stream: null, photo: null, error: null });

/**
 * One camera session. Owns the stream, so it can guarantee the tracks are stopped.
 * `onState` receives every new state; after `dispose()` nothing is emitted any more.
 * `maxBytes` may be a number or a function returning one (read at capture time).
 */
export function createCameraController({ mediaDevices = globalThis.navigator?.mediaDevices, isSecureContext = globalThis.isSecureContext ?? true, maxBytes, onState = () => {}, createCanvas } = {}) {
  let state = initialCameraState;
  let token = 0; // bumps whenever a pending start must be abandoned
  let disposed = false;

  function set(next) {
    state = { ...state, ...next };
    if (!disposed) onState(state);
  }

  function release() {
    stopStream(state.stream);
  }

  async function start() {
    if (disposed || state.phase === 'starting' || state.phase === 'live') return;
    const mine = ++token;
    set({ phase: 'starting', stream: null, photo: null, error: null });
    let stream;
    try {
      stream = await openCameraStream({ mediaDevices, isSecureContext });
    } catch (err) {
      if (mine !== token || disposed) return;
      set({ phase: 'error', error: classifyCameraError(err, { isSecureContext }) });
      return;
    }
    if (mine !== token || disposed) {
      stopStream(stream); // closed while the browser was still asking: never leave it running
      return;
    }
    for (const track of stream.getVideoTracks?.() ?? []) {
      track.addEventListener?.('ended', () => {
        if (state.stream !== stream || state.phase !== 'live') return;
        stopStream(stream);
        set({ phase: 'error', stream: null, error: cameraError('DEVICE_LOST') });
      });
    }
    set({ phase: 'live', stream });
  }

  async function capture(video) {
    if (state.phase !== 'live') return;
    try {
      const photo = await captureFrame(video, { maxBytes: typeof maxBytes === 'function' ? maxBytes() : maxBytes, createCanvas });
      if (disposed || state.phase !== 'live') return;
      release(); // the camera is not needed while the photo is being reviewed
      set({ phase: 'captured', stream: null, photo });
    } catch (err) {
      if (disposed) return;
      release();
      set({ phase: 'error', stream: null, error: classifyCameraError(err, { isSecureContext }) });
    }
  }

  function retake() {
    if (disposed) return Promise.resolve();
    token += 1;
    release();
    state = { ...state, phase: 'idle', stream: null, photo: null, error: null };
    return start();
  }

  /** Stops the camera without emitting a state (used on unmount). */
  function dispose() {
    disposed = true;
    token += 1;
    release();
    state = { ...state, phase: 'idle', stream: null };
  }

  return { start, capture, retake, dispose, getState: () => state };
}
