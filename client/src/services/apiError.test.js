import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toApiError } from './apiError.js';

describe('toApiError', () => {
  it('reads the API error envelope, including field errors', () => {
    const result = toApiError({
      response: {
        status: 400,
        data: { error: { code: 'VALIDATION_ERROR', message: 'Check the fields.', details: { email: 'Bad email.' } } },
      },
    });
    assert.deepEqual(result, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Check the fields.',
      fieldErrors: { email: 'Bad email.' },
    });
  });

  it('falls back to a generic message when the body is not the API envelope', () => {
    const result = toApiError({ response: { status: 502, data: '<html>Bad gateway</html>' } });
    assert.equal(result.status, 502);
    assert.equal(result.code, 'UNKNOWN_ERROR');
    assert.deepEqual(result.fieldErrors, {});
    assert.doesNotMatch(result.message, /html/i);
  });

  it('describes network failures and timeouts', () => {
    assert.equal(toApiError({ request: {}, code: 'ERR_NETWORK' }).code, 'NETWORK_ERROR');
    assert.equal(toApiError({ code: 'ECONNABORTED' }).code, 'NETWORK_ERROR');
  });

  it('never throws on unexpected input', () => {
    assert.equal(toApiError(undefined).code, 'CLIENT_ERROR');
    assert.equal(toApiError(new Error('boom')).code, 'CLIENT_ERROR');
  });
});
