import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { createInFlightLimiter, fileTooLarge, mapMulterError, rejectOversizeRequests } from '../middleware/uploadGuards.js';
import { HttpError } from '../utils/httpError.js';

const MB = 1024 * 1024;
const run = (middleware, req, res = new EventEmitter()) => {
  let outcome = 'pending';
  middleware(req, res, (err) => {
    outcome = err ?? 'next';
  });
  return { outcome, res };
};

describe('rejectOversizeRequests', () => {
  const guard = rejectOversizeRequests(5 * MB);

  it('lets normal and unknown-size requests through to Multer', () => {
    assert.equal(run(guard, { headers: { 'content-length': String(2 * MB) } }).outcome, 'next');
    assert.equal(run(guard, { headers: {} }).outcome, 'next');
    assert.equal(run(guard, { headers: { 'content-length': 'garbage' } }).outcome, 'next');
  });

  it('allows a little overhead above the file limit for multipart framing', () => {
    assert.equal(run(guard, { headers: { 'content-length': String(5 * MB + 1000) } }).outcome, 'next');
  });

  it('refuses a request that announces a far larger body, before anything is read', () => {
    const { outcome } = run(guard, { headers: { 'content-length': String(50 * MB) } });
    assert.ok(outcome instanceof HttpError);
    assert.deepEqual([outcome.status, outcome.code], [413, 'FILE_TOO_LARGE']);
    assert.match(outcome.message, /5 MB/);
  });
});

describe('createInFlightLimiter', () => {
  it('allows up to max at once, then answers 503 SERVER_BUSY', () => {
    const limiter = createInFlightLimiter({ max: 2 });
    const a = run(limiter, {});
    const b = run(limiter, {});
    const c = run(limiter, {});
    assert.equal(a.outcome, 'next');
    assert.equal(b.outcome, 'next');
    assert.ok(c.outcome instanceof HttpError);
    assert.deepEqual([c.outcome.status, c.outcome.code], [503, 'SERVER_BUSY']);
  });

  it('frees the slot when the response finishes or the client disconnects, exactly once', () => {
    const limiter = createInFlightLimiter({ max: 1 });
    const first = run(limiter, {});
    first.res.emit('finish');
    first.res.emit('close'); // both events fire for a normal response
    assert.equal(run(limiter, {}).outcome, 'next'); // slot free again
    const second = run(limiter, {});
    assert.ok(second.outcome instanceof HttpError); // the counter did not go negative

    const aborted = createInFlightLimiter({ max: 1 });
    const held = run(aborted, {});
    held.res.emit('close');
    assert.equal(run(aborted, {}).outcome, 'next');
  });
});

describe('mapMulterError', () => {
  const opts = { maxBytes: 5 * MB };
  const map = (code) => mapMulterError(Object.assign(new Error('internal multer detail /tmp/x'), { code }), opts);

  it('maps the size limit to 413 with the limit in the message', () => {
    const err = map('LIMIT_FILE_SIZE');
    assert.deepEqual([err.status, err.code], [413, 'FILE_TOO_LARGE']);
    assert.match(err.message, /5 MB/);
    assert.deepEqual(fileTooLarge(5 * MB).message, err.message);
  });

  it('maps a wrong field name and extra files to 400', () => {
    assert.deepEqual([map('LIMIT_UNEXPECTED_FILE').status, map('LIMIT_UNEXPECTED_FILE').code], [400, 'UNEXPECTED_FIELD']);
    assert.deepEqual([map('LIMIT_FILE_COUNT').status, map('LIMIT_FILE_COUNT').code], [400, 'TOO_MANY_FILES']);
  });

  it('maps every other parser error to a generic 400 and never leaks internals', () => {
    for (const code of ['LIMIT_FIELD_COUNT', 'LIMIT_PART_COUNT', 'LIMIT_FIELD_KEY', 'LIMIT_FIELD_VALUE', 'SOMETHING_NEW', undefined]) {
      const err = map(code);
      assert.deepEqual([err.status, err.code], [400, 'INVALID_UPLOAD']);
      assert.doesNotMatch(err.message, /multer|tmp/);
    }
    assert.equal(mapMulterError(new Error('Unexpected end of form'), opts).code, 'INVALID_UPLOAD');
  });

  it('passes through errors that are already API errors (for example the type filter)', () => {
    const original = new HttpError(415, 'UNSUPPORTED_FILE_TYPE', 'Choose a JPG, PNG or WebP image.');
    assert.equal(mapMulterError(original, opts), original);
  });
});
