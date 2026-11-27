import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAMERA_CONSTRAINTS,
  CameraError,
  captureFrame,
  capturedFileName,
  classifyCameraError,
  createCameraController,
  isCameraSupported,
  openCameraStream,
  stopStream,
} from './camera.js';
import { FALLBACK_OPTIONS, initialScanState, scanReducer, validateImageFile } from './scanFlow.js';

// ---------- mocks (no physical camera, no browser) ----------
function fakeTrack() {
  const listeners = {};
  return {
    stopped: 0,
    stop() { this.stopped += 1; },
    addEventListener(name, fn) { listeners[name] = fn; },
    fire(name) { listeners[name]?.(); },
  };
}
function fakeStream(trackCount = 1) {
  const tracks = Array.from({ length: trackCount }, fakeTrack);
  return { tracks, getTracks: () => tracks, getVideoTracks: () => tracks };
}
const domError = (name) => Object.assign(new Error(name), { name });
function fakeDevices(behaviour) {
  const calls = [];
  return {
    calls,
    getUserMedia: async (constraints) => {
      calls.push(constraints);
      return behaviour(constraints, calls.length);
    },
  };
}
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
/** A canvas whose toBlob reports a size that depends on the quality, so size limits can be tested. */
function fakeCanvasFactory({ sizeAt = () => 1000, empty = false } = {}) {
  const made = [];
  const createCanvas = () => {
    const canvas = {
      width: 0,
      height: 0,
      drawn: null,
      getContext: () => ({ drawImage: (_v, x, y, w, h) => { canvas.drawn = { x, y, w, h }; } }),
      toBlob(callback, type, quality) {
        if (empty) return callback(null);
        const bytes = new Uint8Array(sizeAt({ quality, width: canvas.width, height: canvas.height }));
        bytes.set(JPEG_BYTES.slice(0, Math.min(8, bytes.length)));
        return callback(new Blob([bytes], { type }));
      },
    };
    made.push(canvas);
    return canvas;
  };
  return { createCanvas, made };
}
const video = (videoWidth = 1280, videoHeight = 720) => ({ videoWidth, videoHeight });

describe('camera support and errors', () => {
  it('detects getUserMedia', () => {
    assert.equal(isCameraSupported({ getUserMedia() {} }), true);
    assert.equal(isCameraSupported({}), false);
    assert.equal(isCameraSupported(undefined), false);
  });

  it('maps browser errors to friendly messages', () => {
    const code = (name, ctx) => classifyCameraError(domError(name), ctx).code;
    assert.equal(code('NotAllowedError'), 'PERMISSION_DENIED');
    assert.equal(code('PermissionDeniedError'), 'PERMISSION_DENIED');
    assert.equal(code('NotFoundError'), 'NO_CAMERA');
    assert.equal(code('NotReadableError'), 'IN_USE');
    assert.equal(code('TypeError', { isSecureContext: false }), 'INSECURE');
    assert.equal(code('SomethingElse'), 'UNKNOWN');
    assert.equal(classifyCameraError(null).code, 'UNKNOWN');
    assert.equal(classifyCameraError(domError('NotAllowedError')).canRetry, true);
    assert.equal(classifyCameraError(domError('NotFoundError')).canRetry, false);
    assert.match(classifyCameraError(domError('NotAllowedError')).message, /blocked/);
    const own = new CameraError('NOT_READY', 'x');
    assert.equal(classifyCameraError(own), own);
  });
});

describe('openCameraStream', () => {
  it('asks for the rear camera without audio', async () => {
    const stream = fakeStream();
    const devices = fakeDevices(() => stream);
    assert.equal(await openCameraStream({ mediaDevices: devices }), stream);
    assert.deepEqual(devices.calls[0], CAMERA_CONSTRAINTS);
    assert.equal(devices.calls[0].video.facingMode.ideal, 'environment');
    assert.equal(devices.calls[0].audio, false);
  });

  it('falls back to any camera when the rear one cannot be matched', async () => {
    const stream = fakeStream();
    const devices = fakeDevices((_c, n) => { if (n === 1) throw domError('OverconstrainedError'); return stream; });
    assert.equal(await openCameraStream({ mediaDevices: devices }), stream);
    assert.deepEqual(devices.calls[1], { audio: false, video: true });
  });

  it('rejects with a CameraError when permission is denied, there is no camera, or it is busy', async () => {
    for (const [name, expected] of [['NotAllowedError', 'PERMISSION_DENIED'], ['NotFoundError', 'NO_CAMERA'], ['NotReadableError', 'IN_USE']]) {
      const devices = fakeDevices(() => { throw domError(name); });
      await assert.rejects(openCameraStream({ mediaDevices: devices }), (err) => err instanceof CameraError && err.code === expected);
    }
  });

  it('reports an unsupported or insecure browser instead of throwing a TypeError', async () => {
    await assert.rejects(openCameraStream({ mediaDevices: undefined, isSecureContext: true }), (e) => e.code === 'UNSUPPORTED');
    await assert.rejects(openCameraStream({ mediaDevices: undefined, isSecureContext: false }), (e) => e.code === 'INSECURE');
  });
});

describe('stopStream', () => {
  it('stops every track and tolerates null or odd streams', () => {
    const stream = fakeStream(2);
    stopStream(stream);
    assert.deepEqual(stream.tracks.map((t) => t.stopped), [1, 1]);
    assert.doesNotThrow(() => stopStream(null));
    assert.doesNotThrow(() => stopStream({}));
    assert.doesNotThrow(() => stopStream({ getTracks: () => [{ stop() { throw new Error('gone'); } }] }));
  });
});

describe('captureFrame', () => {
  it('produces a valid JPEG File that passes the existing upload validation', async () => {
    const { createCanvas, made } = fakeCanvasFactory();
    const file = await captureFrame(video(1280, 720), { createCanvas, now: new Date(2026, 10, 24, 9, 5, 7) });
    assert.ok(file instanceof File);
    assert.equal(file.type, 'image/jpeg');
    assert.equal(file.name, 'label-photo-20261124-090507.jpg');
    assert.ok(file.size > 0);
    assert.equal(validateImageFile(file, FALLBACK_OPTIONS), undefined);
    assert.deepEqual(made[0].drawn, { x: 0, y: 0, w: 1280, h: 720 });
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer()).slice(0, 3)], [0xff, 0xd8, 0xff]); // JPEG signature
  });

  it('never exceeds 2048 px on the longest side and keeps the aspect ratio', async () => {
    const { createCanvas, made } = fakeCanvasFactory();
    await captureFrame(video(4000, 3000), { createCanvas });
    assert.equal(made[0].width, 2048);
    assert.equal(made[0].height, 1536);
    const portrait = fakeCanvasFactory();
    await captureFrame(video(3000, 4000), { createCanvas: portrait.createCanvas });
    assert.equal(portrait.made[0].height, 2048);
    assert.equal(portrait.made[0].width, 1536);
  });

  it('lowers quality, then size, until the photo fits the upload limit', async () => {
    const limit = FALLBACK_OPTIONS.maxUploadBytes;
    const { createCanvas, made } = fakeCanvasFactory({ sizeAt: ({ quality, width }) => (width > 1500 ? limit + 1 : Math.round(quality * 1000)) });
    const file = await captureFrame(video(2000, 1500), { createCanvas, maxBytes: limit });
    assert.ok(file.size <= limit);
    assert.ok(made.length >= 2, 'it shrank the picture after lowering quality was not enough');
    assert.equal(validateImageFile(file, FALLBACK_OPTIONS), undefined);
  });

  it('fails clearly when the video has no frame yet, or the canvas produces nothing', async () => {
    await assert.rejects(captureFrame(video(0, 0), { createCanvas: fakeCanvasFactory().createCanvas }), (e) => e.code === 'NOT_READY');
    await assert.rejects(captureFrame(video(), { createCanvas: fakeCanvasFactory({ empty: true }).createCanvas }), (e) => e.code === 'CAPTURE_FAILED');
    await assert.rejects(captureFrame(video(), { maxBytes: 10, createCanvas: fakeCanvasFactory({ sizeAt: () => 5000 }).createCanvas }), (e) => e.code === 'CAPTURE_FAILED');
  });

  it('names files from the local date and time', () => {
    assert.equal(capturedFileName(new Date(2026, 0, 2, 3, 4, 5)), 'label-photo-20260102-030405.jpg');
  });
});

describe('camera controller', () => {
  const setup = (behaviour, extra = {}) => {
    const streams = [];
    const devices = fakeDevices((...args) => { const s = behaviour ? behaviour(...args) : fakeStream(); streams.push(s); return s; });
    const states = [];
    const canvases = fakeCanvasFactory();
    const controller = createCameraController({ mediaDevices: devices, onState: (s) => states.push(s), createCanvas: canvases.createCanvas, ...extra });
    return { controller, devices, streams, states };
  };

  it('opens the camera when permission is granted', async () => {
    const { controller, streams, states } = setup();
    await controller.start();
    assert.deepEqual(states.map((s) => s.phase), ['starting', 'live']);
    assert.equal(controller.getState().stream, streams[0]);
    assert.equal(streams[0].tracks[0].stopped, 0);
  });

  it('shows a clear error when permission is denied, and when there is no camera', async () => {
    const denied = setup(() => { throw domError('NotAllowedError'); });
    await denied.controller.start();
    assert.equal(denied.controller.getState().phase, 'error');
    assert.equal(denied.controller.getState().error.code, 'PERMISSION_DENIED');
    const none = setup(() => { throw domError('NotFoundError'); });
    await none.controller.start();
    assert.equal(none.controller.getState().error.code, 'NO_CAMERA');
    const unsupported = createCameraController({ mediaDevices: undefined });
    await unsupported.start();
    assert.equal(unsupported.getState().error.code, 'UNSUPPORTED');
  });

  it('captures a photo, stops the camera, and offers the file', async () => {
    const { controller, streams } = setup();
    await controller.start();
    await controller.capture(video());
    const state = controller.getState();
    assert.equal(state.phase, 'captured');
    assert.equal(state.stream, null);
    assert.equal(state.photo.type, 'image/jpeg');
    assert.deepEqual(streams[0].tracks.map((t) => t.stopped), [1]);
  });

  it('retake opens a fresh camera and drops the photo', async () => {
    const { controller, streams } = setup();
    await controller.start();
    await controller.capture(video());
    await controller.retake();
    const state = controller.getState();
    assert.equal(state.phase, 'live');
    assert.equal(state.photo, null);
    assert.equal(streams.length, 2);
    assert.equal(state.stream, streams[1]);
  });

  it('stops all tracks when disposed (unmount) while live', async () => {
    const { controller, streams, states } = setup(() => fakeStream(2));
    await controller.start();
    const before = states.length;
    controller.dispose();
    assert.deepEqual(streams[0].tracks.map((t) => t.stopped), [1, 1]);
    assert.equal(states.length, before, 'nothing is emitted after dispose');
  });

  it('stops a stream that arrives after the camera was already closed', async () => {
    let release;
    const stream = fakeStream();
    const devices = { getUserMedia: () => new Promise((resolve) => { release = () => resolve(stream); }) };
    const controller = createCameraController({ mediaDevices: devices });
    const starting = controller.start();
    controller.dispose(); // user left (or StrictMode remounted) while the permission prompt was open
    release();
    await starting;
    assert.equal(stream.tracks[0].stopped, 1);
    assert.equal(controller.getState().stream, null);
  });

  it('reports a lost camera and stops it when the track ends', async () => {
    const { controller, streams } = setup();
    await controller.start();
    streams[0].tracks[0].fire('ended');
    assert.equal(controller.getState().phase, 'error');
    assert.equal(controller.getState().error.code, 'DEVICE_LOST');
    assert.equal(streams[0].tracks[0].stopped, 1);
  });

  it('turns a failed capture into an error and releases the camera', async () => {
    const { controller, streams } = setup();
    await controller.start();
    await controller.capture(video(0, 0));
    assert.equal(controller.getState().phase, 'error');
    assert.equal(controller.getState().error.code, 'NOT_READY');
    assert.equal(streams[0].tracks[0].stopped, 1);
  });

  it('reads the size limit when the photo is taken', async () => {
    let limit = 10_000_000;
    const streams = [];
    const canvases = fakeCanvasFactory({ sizeAt: () => 2000 });
    const controller = createCameraController({ mediaDevices: fakeDevices(() => { const s = fakeStream(); streams.push(s); return s; }), maxBytes: () => limit, createCanvas: canvases.createCanvas });
    await controller.start();
    limit = 100; // limit changed after the camera opened (for example, the options response arrived)
    await controller.capture(video());
    assert.equal(controller.getState().error.code, 'CAPTURE_FAILED');
  });
});

describe('captured photo uses the existing scan flow', () => {
  it('is selected, validated and ready to upload like any chosen file', async () => {
    const { createCanvas } = fakeCanvasFactory();
    const photo = await captureFrame(video(), { createCanvas });
    assert.equal(validateImageFile(photo, FALLBACK_OPTIONS), undefined);
    const selected = scanReducer(initialScanState, { type: 'SELECT', file: photo, previewUrl: 'blob:camera' });
    assert.equal(selected.phase, 'selected');
    assert.equal(selected.file, photo);
    assert.equal(scanReducer(selected, { type: 'EXTRACT_START' }).phase, 'extracting');
  });

  it('is sent in the same multipart "image" field the upload uses', async () => {
    const { createCanvas } = fakeCanvasFactory();
    const photo = await captureFrame(video(), { createCanvas });
    const form = new FormData(); // the exact construction used by services/scanService.js extractLabel
    form.append('image', photo);
    const sent = form.get('image');
    assert.equal(sent.type, 'image/jpeg');
    assert.equal(sent.size, photo.size);
  });

  it('is refused by the same rules when it is too large', () => {
    const big = { type: 'image/jpeg', size: FALLBACK_OPTIONS.maxUploadBytes + 1 };
    assert.match(validateImageFile(big, FALLBACK_OPTIONS), /limit/);
  });

  it('leaves the upload path unchanged', () => {
    const upload = { type: 'image/png', size: 1000 };
    assert.equal(validateImageFile(upload, FALLBACK_OPTIONS), undefined);
    assert.equal(scanReducer(initialScanState, { type: 'SELECT', file: upload, previewUrl: 'blob:1' }).phase, 'selected');
    assert.match(validateImageFile({ type: 'image/gif', size: 5 }, FALLBACK_OPTIONS), /JPG, PNG or WebP/);
  });
});
