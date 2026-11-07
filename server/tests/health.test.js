import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TEST_ORIGIN, makeTestApp, request, withServer } from './helpers.js';

const ORIGIN = TEST_ORIGIN;

function makeApp(database) {
  return makeTestApp({ database }).app;
}

describe('GET /api/v1/health', () => {
  it('reports ok when the database is connected', () =>
    withServer(makeApp('connected'), async (url) => {
      const res = await request(url, '/api/v1/health');
      assert.equal(res.status, 200);
      assert.equal(res.json.status, 'ok');
      assert.equal(res.json.checks.database, 'connected');
      assert.equal(res.json.version, '0.0.0-test');
      assert.equal(res.json.service, 'nutrilens-api');
      assert.ok(Number.isFinite(Date.parse(res.json.timestamp)));
    }));

  it('reports degraded (still HTTP 200) when the database is down', () =>
    withServer(makeApp('disconnected'), async (url) => {
      const res = await request(url, '/api/v1/health');
      assert.equal(res.status, 200);
      assert.equal(res.json.status, 'degraded');
    }));

  it('is never cached', () =>
    withServer(makeApp('connected'), async (url) => {
      const res = await request(url, '/api/v1/health');
      assert.equal(res.headers['cache-control'], 'no-store');
    }));

  it('allows only the configured client origin and sets security headers', () =>
    withServer(makeApp('connected'), async (url) => {
      const allowed = await request(url, '/api/v1/health', { headers: { Origin: ORIGIN } });
      assert.equal(allowed.headers['access-control-allow-origin'], ORIGIN);
      assert.equal(allowed.headers['x-powered-by'], undefined);
      assert.equal(allowed.headers['x-content-type-options'], 'nosniff');

      const other = await request(url, '/api/v1/health', { headers: { Origin: 'https://evil.example' } });
      assert.equal(other.headers['access-control-allow-origin'], undefined);
      assert.equal(other.headers['access-control-allow-credentials'], undefined);
    }));

  it('sends no CORS headers when there is no Origin header', () =>
    withServer(makeApp('connected'), async (url) => {
      const res = await request(url, '/api/v1/health');
      assert.equal(res.status, 200);
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    }));

  it('answers preflight requests only for the configured origin', () =>
    withServer(makeApp('connected'), async (url) => {
      const preflight = (origin) =>
        request(url, '/api/auth/login', {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });
      const allowed = await preflight(ORIGIN);
      assert.equal(allowed.status, 204);
      assert.equal(allowed.headers['access-control-allow-origin'], ORIGIN);
      assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

      const blocked = await preflight('https://evil.example');
      assert.equal(blocked.headers['access-control-allow-origin'], undefined);
    }));
});

describe('error handling', () => {
  it('returns the error envelope for unknown routes', () =>
    withServer(makeApp('connected'), async (url) => {
      const res = await request(url, '/api/v1/nope');
      assert.equal(res.status, 404);
      assert.equal(res.json.error.code, 'NOT_FOUND');
    }));

  it('returns the error envelope for malformed JSON', () =>
    withServer(makeApp('connected'), async (url) => {
      const res = await request(url, '/api/v1/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      });
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'INVALID_JSON');
    }));
});
