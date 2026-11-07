import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCookieOptions, parseCookies } from '../utils/cookies.js';

describe('parseCookies', () => {
  it('parses several cookies and decodes values', () => {
    assert.deepEqual(parseCookies('a=1; nl_token=abc.def.ghi; b=hello%20world'), {
      a: '1',
      nl_token: 'abc.def.ghi',
      b: 'hello world',
    });
  });

  it('copes with empty, malformed and quoted input', () => {
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies('novalue; =x; ok="q"'), { ok: 'q' });
    assert.deepEqual(parseCookies('bad=%E0%A4%A'), { bad: '%E0%A4%A' });
  });
});

describe('buildCookieOptions', () => {
  it('is always HTTP-only and site-wide', () => {
    const options = buildCookieOptions({ secure: true, sameSite: 'lax', maxAgeMs: 1000 });
    assert.deepEqual(options, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 1000 });
  });
});
