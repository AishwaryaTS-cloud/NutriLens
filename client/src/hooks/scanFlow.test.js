import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FALLBACK_OPTIONS, initialScanState, scanReducer, validateImageFile } from './scanFlow.js';

const run = (actions, from = initialScanState) => actions.reduce(scanReducer, from);
const file = { type: 'image/png', size: 1000 };
const extraction = { status: 'ok', label: { productName: 'Oats', per100g: { sugar: 8 }, perServing: {}, servingSize: { value: 50, unit: 'g' }, allergenInfo: { contains: [], mayContain: [], complete: true } }, issues: [], readability: { unreadableFields: [] }, columnsFound: ['per 100 g'] };
const analysis = { match: { finalScore: 70 }, issues: [] };
const extracting = () => run([{ type: 'SELECT', file, previewUrl: 'blob:1' }, { type: 'EXTRACT_START' }]);
const review = () => run([{ type: 'EXTRACT_OK', extraction }], extracting());

describe('scan flow', () => {
  it('validates files', () => {
    assert.equal(validateImageFile(file), undefined);
    assert.match(validateImageFile({ type: 'image/gif', size: 5 }), /JPG, PNG or WebP/);
    assert.match(validateImageFile({ type: 'image/png', size: 0 }), /empty/);
    assert.match(validateImageFile({ type: 'image/png', size: FALLBACK_OPTIONS.maxUploadBytes + 1 }), /limit/);
    assert.match(validateImageFile(null), /Choose/);
  });
  it('moves idle -> selected -> extracting -> review with the extracted form', () => {
    assert.equal(run([{ type: 'SELECT', file, previewUrl: 'blob:1' }]).phase, 'selected');
    assert.equal(extracting().phase, 'extracting');
    const state = review();
    assert.equal(state.phase, 'review');
    assert.equal(state.form.productName, 'Oats');
    assert.equal(state.form.per100g.sugar, '8');
    assert.equal(state.form.per100g.protein, '');
    assert.equal(state.extraction.status, 'ok');
  });
  it('shows a failure and lets the user retry or enter values manually', () => {
    const failed = run([{ type: 'EXTRACT_FAIL', error: { message: 'quota', code: 'GEMINI_QUOTA_EXCEEDED' } }], extracting());
    assert.equal(failed.phase, 'failed');
    assert.equal(failed.error.code, 'GEMINI_QUOTA_EXCEEDED');
    assert.equal(scanReducer(failed, { type: 'EXTRACT_START' }).phase, 'extracting');
    const manual = scanReducer(failed, { type: 'MANUAL' });
    assert.equal(manual.phase, 'review');
    assert.equal(manual.error, null);
    assert.equal(manual.form.per100g.sugar, '');
  });
  it('allows manual entry straight from the start', () => {
    assert.equal(scanReducer(initialScanState, { type: 'MANUAL' }).phase, 'review');
  });
  it('ignores file changes and manual mode while extracting or analysing', () => {
    assert.equal(scanReducer(extracting(), { type: 'SELECT', file, previewUrl: 'x' }).phase, 'extracting');
    assert.equal(scanReducer(extracting(), { type: 'MANUAL' }).phase, 'extracting');
  });
  it('analyses: review -> analysing -> results', () => {
    const analysing = scanReducer(review(), { type: 'ANALYSE_START' });
    assert.equal(analysing.phase, 'analysing');
    const results = scanReducer(analysing, { type: 'ANALYSE_OK', analysis, explanation: { source: 'rules' } });
    assert.equal(results.phase, 'results');
    assert.equal(results.analysis, analysis);
  });
  it('returns to review with field issues when validation fails', () => {
    const issues = [{ field: 'per100g.sugar', severity: 'error', message: 'bad' }];
    const state = run([{ type: 'ANALYSE_START' }, { type: 'ANALYSE_FAIL', error: { message: 'fix' }, issues }], review());
    assert.equal(state.phase, 'review');
    assert.deepEqual(state.issues, issues);
    assert.equal(state.form.productName, 'Oats', 'edits are kept');
  });
  it('edits only in review and keeps edits when going back from results', () => {
    const edited = scanReducer(review(), { type: 'EDIT', form: { ...review().form, productName: 'Changed' } });
    const results = run([{ type: 'ANALYSE_START' }, { type: 'ANALYSE_OK', analysis, explanation: null }], edited);
    assert.equal(scanReducer(results, { type: 'EDIT', form: {} }).form.productName, 'Changed');
    const back = scanReducer(results, { type: 'BACK_TO_EDIT' });
    assert.equal(back.phase, 'review');
    assert.equal(back.form.productName, 'Changed');
  });
  it('saves once', () => {
    const results = run([{ type: 'ANALYSE_START' }, { type: 'ANALYSE_OK', analysis, explanation: null }], review());
    const saving = scanReducer(results, { type: 'SAVE_START' });
    assert.equal(saving.saving, true);
    const saved = scanReducer(saving, { type: 'SAVED', id: 'abc' });
    assert.equal(saved.savedId, 'abc');
    assert.equal(scanReducer(saved, { type: 'SAVE_START' }).saving, false, 'cannot save twice');
    assert.equal(scanReducer(saving, { type: 'SAVE_FAIL', error: { message: 'x' } }).saving, false);
  });
  it('ignores out-of-order actions', () => {
    assert.equal(scanReducer(initialScanState, { type: 'EXTRACT_OK', extraction }).phase, 'idle');
    assert.equal(scanReducer(initialScanState, { type: 'ANALYSE_OK', analysis }).phase, 'idle');
  });
  it('resets', () => {
    assert.deepEqual(scanReducer(review(), { type: 'RESET' }), initialScanState);
  });
});
