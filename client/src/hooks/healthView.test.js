import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SLOW_THRESHOLD_MS, deriveConnectionView, formatUptime } from './healthView.js';

const ok = { status: 'ok', checks: { database: 'connected' } };

describe('deriveConnectionView', () => {
  it('is checking (not slow) right after the request starts', () => {
    assert.deepEqual(deriveConnectionView({ isError: false, health: undefined, elapsedMs: 300 }), {
      kind: 'checking',
      slow: false,
    });
  });

  it('flags a slow first response so the UI can explain a cold start', () => {
    assert.deepEqual(
      deriveConnectionView({ isError: false, health: undefined, elapsedMs: SLOW_THRESHOLD_MS }),
      { kind: 'checking', slow: true },
    );
  });

  it('is online and healthy when the API reports ok', () => {
    assert.deepEqual(deriveConnectionView({ isError: false, health: ok, elapsedMs: 0 }), {
      kind: 'online',
      degraded: false,
    });
  });

  it('is online but degraded when the database is down', () => {
    const health = { status: 'degraded', checks: { database: 'disconnected' } };
    assert.deepEqual(deriveConnectionView({ isError: false, health, elapsedMs: 0 }), {
      kind: 'online',
      degraded: true,
    });
  });

  it('is offline when the request failed and there is no data', () => {
    assert.deepEqual(deriveConnectionView({ isError: true, health: undefined, elapsedMs: 0 }), {
      kind: 'offline',
    });
  });

  it('keeps showing the last good result even if a later re-check fails', () => {
    assert.deepEqual(deriveConnectionView({ isError: true, health: ok, elapsedMs: 0 }), {
      kind: 'online',
      degraded: false,
    });
  });
});

describe('formatUptime', () => {
  it('formats seconds, minutes and hours', () => {
    assert.equal(formatUptime(9), '9s');
    assert.equal(formatUptime(125), '2m 5s');
    assert.equal(formatUptime(7500), '2h 5m');
  });

  it('never returns a negative value', () => {
    assert.equal(formatUptime(-5), '0s');
  });
});
