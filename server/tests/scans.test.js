import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GeminiError,
  TEST_ORIGIN,
  createCapturingLogger,
  createFakeGemini,
  createFakePrepare,
  fixtures,
  imagePart,
  makeTestApp,
  request,
  sampleExplanation,
  sampleGeminiRaw,
  sendJson,
  signUp,
  uploadImage,
  validPreferences,
  validUser,
  withServer,
} from './helpers.js';
import { labelWith, GOOD_NUTRIENTS } from './helpers-labels.js';
import { normaliseExtraction } from '../../ai/nutrition/labelValidator.js';

const png = (extra) => [imagePart(fixtures.png(extra))];
const asType = (content, filename, contentType) => [imagePart(content, { filename, contentType })];
const auth = (cookie) => ({ Cookie: cookie, Origin: TEST_ORIGIN });

async function withApp(options, fn) {
  const made = makeTestApp(options);
  return withServer(made.app, async (url) => {
    const { cookie } = await signUp(url);
    return fn({ url, cookie, ...made });
  });
}
const savePrefs = (url, cookie, body = validPreferences) => sendJson('PUT', url, '/api/profile/preferences', body, auth(cookie));
const analyse = (url, cookie, label) => sendJson('POST', url, '/api/scans/analyse', { label }, auth(cookie));
const save = (url, cookie, body) => sendJson('POST', url, '/api/scans', body, auth(cookie));
const get = (url, cookie, path) => request(url, path, { headers: { Cookie: cookie } });
const confirmedLabel = () => normaliseExtraction(sampleGeminiRaw()).label;

describe('POST /api/scans/extract: Gemini Vision extraction', () => {
  it('sends the image to Gemini and returns normalised, validated JSON', () =>
    withApp({}, async ({ url, cookie, scan }) => {
      for (const [content, filename, contentType] of [[fixtures.jpeg(), 'a.jpg', 'image/jpeg'], [fixtures.png(), 'a.png', 'image/png'], [fixtures.webp(), 'a.webp', 'image/webp']]) {
        const res = await uploadImage(url, cookie, asType(content, filename, contentType));
        assert.equal(res.status, 200, contentType);
        assert.equal(res.headers['cache-control'], 'no-store');
        const { extraction } = res.json;
        assert.equal(extraction.status, 'ok');
        assert.equal(extraction.label.productName, 'Crunchy Oat Biscuits');
        assert.equal(extraction.label.per100g.sugar, 8);
        assert.equal(extraction.label.per100g.addedSugar, 7);
        assert.deepEqual(extraction.image, { width: 1600, height: 1200 });
        assert.doesNotMatch(res.text, /a\.(jpg|png|webp)/, 'file name is never echoed');
      }
      assert.equal(scan.gemini.calls.extraction, 3);
      const sentPart = scan.gemini.calls.requests[0].parts[0].inlineData;
      assert.equal(sentPart.mimeType, 'image/jpeg');
      assert.equal(sentPart.data, Buffer.from('prepared').toString('base64'));
    }));

  it('keeps missing and unreadable values as null with readability notes', () =>
    withApp({ scanOptions: { gemini: createFakeGemini({ extraction: (() => { const raw = sampleGeminiRaw(); raw.nutrition.per100g.fibre = null; raw.readability = { imageQuality: 'poor', unreadableFields: ['per100g.fibre'], uncertainFields: ['servingSize'], notes: ['Blurry'] }; return raw; })() }) } }, async ({ url, cookie }) => {
      const { extraction } = (await uploadImage(url, cookie, png())).json;
      assert.equal(extraction.status, 'partial');
      assert.equal(extraction.label.per100g.fibre, null);
      assert.deepEqual(extraction.readability.unreadableFields, ['per100g.fibre']);
      assert.deepEqual(extraction.readability.uncertainFields, ['servingSize']);
    }));

  it('requires login and never calls Gemini for anonymous requests', () =>
    withApp({}, async ({ url, scan }) => {
      const res = await uploadImage(url, undefined, png());
      assert.equal(res.status, 401);
      assert.equal(scan.gemini.calls.extraction, 0);
    }));

  it('rejects bad files before any image preparation or Gemini call', () =>
    withApp({}, async ({ url, cookie, scan }) => {
      const cases = [
        [asType(fixtures.gif(), 'a.gif', 'image/gif'), 415, 'UNSUPPORTED_FILE_TYPE'],
        [asType(fixtures.svg(), 'a.svg', 'image/svg+xml'), 415, 'UNSUPPORTED_FILE_TYPE'],
        [asType(fixtures.pdf(), 'a.pdf', 'application/pdf'), 415, 'UNSUPPORTED_FILE_TYPE'],
        [asType(fixtures.text(), 'a.png', 'image/png'), 415, 'UNSUPPORTED_FILE_TYPE'],
        [asType(fixtures.jpeg(), 'a.png', 'image/png'), 415, 'FILE_TYPE_MISMATCH'],
        [[], 400, 'INVALID_UPLOAD'],
        [[imagePart(Buffer.alloc(0))], 400, 'EMPTY_FILE'],
        [[imagePart(fixtures.png(), { name: 'file' })], 400, 'UNEXPECTED_FIELD'],
        [[...png(), { name: 'enhance', content: 'true' }], 400, 'INVALID_UPLOAD'],
      ];
      for (const [parts, status, code] of cases) {
        const res = await uploadImage(url, cookie, parts);
        assert.equal(res.status, status, code);
        assert.equal(res.json.error.code === 'NO_FILE' ? 'INVALID_UPLOAD' : res.json.error.code, code);
      }
      const big = await uploadImage(url, cookie, [imagePart(Buffer.concat([fixtures.png(), Buffer.alloc(70 * 1024)]))]);
      assert.equal(big.status, 413);
      assert.equal(big.json.error.code, 'FILE_TOO_LARGE');
      assert.equal(scan.gemini.calls.extraction, 0);
      assert.equal(scan.prepare.calls.length, 0);
    }));

  it('reports damaged and oversized-pixel images without calling Gemini', () =>
    withApp({}, async ({ url, cookie, scan }) => {
      assert.equal((await uploadImage(url, cookie, [imagePart(fixtures.corruptPng())])).json.error.code, 'INVALID_IMAGE');
      assert.equal((await uploadImage(url, cookie, [imagePart(fixtures.hugePng())])).json.error.code, 'IMAGE_DIMENSIONS_TOO_LARGE');
      assert.equal(scan.gemini.calls.extraction, 0);
    }));

  const failures = [
    ['quota / rate limit', new GeminiError('GEMINI_QUOTA', 'q'), 429, 'GEMINI_QUOTA_EXCEEDED'],
    ['app daily limit', new GeminiError('GEMINI_LIMIT', 'l'), 429, 'GEMINI_DAILY_LIMIT'],
    ['not configured', new GeminiError('GEMINI_NOT_CONFIGURED', 'n'), 503, 'GEMINI_NOT_CONFIGURED'],
    ['bad key', new GeminiError('GEMINI_AUTH', 'a'), 503, 'GEMINI_UNAVAILABLE'],
    ['outage', new GeminiError('GEMINI_UNAVAILABLE', 'u'), 503, 'GEMINI_UNAVAILABLE'],
    ['timeout', new GeminiError('GEMINI_TIMEOUT', 't'), 504, 'GEMINI_TIMEOUT'],
    ['blocked image', new GeminiError('GEMINI_BLOCKED', 'b'), 422, 'GEMINI_BLOCKED'],
    ['malformed answer', new GeminiError('GEMINI_BAD_RESPONSE', 'm'), 502, 'GEMINI_BAD_RESPONSE'],
    ['unexpected JSON shape', { unexpected: true }, 502, 'GEMINI_BAD_RESPONSE'],
    ['unexpected crash', new Error('boom'), 500, 'EXTRACTION_FAILED'],
  ];
  for (const [name, extraction, status, code] of failures) {
    it(`maps a Gemini failure (${name}) to ${status} ${code} with a manual-entry hint and no secrets`, () =>
      withApp({ scanOptions: { gemini: createFakeGemini({ extraction }) } }, async ({ url, cookie }) => {
        const res = await uploadImage(url, cookie, png());
        assert.equal(res.status, status);
        assert.equal(res.json.error.code, code);
        assert.match(res.json.error.message, /./);
        if (status !== 422 || code === 'GEMINI_BLOCKED') assert.match(res.json.error.message, /by hand|try again/i);
        assert.doesNotMatch(res.text, /test-key|boom/);
      }));
  }

  it('logs outcomes only, never label content, file names or the image', () => {
    const logger = createCapturingLogger();
    return withApp({ logger, scanOptions: { logger } }, async ({ url, cookie }) => {
      await uploadImage(url, cookie, png());
      const text = logger.lines.join('\n');
      assert.match(text, /label extracted/);
      assert.doesNotMatch(text, /Crunchy|Oat|label\.png|Test Foods|Milk solids/);
    });
  });

  it('does not use an OCR engine: only Gemini and the injected image preparation run', () =>
    withApp({}, async ({ url, cookie, scan }) => {
      await uploadImage(url, cookie, png());
      assert.equal(scan.gemini.calls.extraction, 1);
      assert.equal(scan.prepare.calls.length, 1);
    }));
});

describe('POST /api/scans/analyse', () => {
  it('requires login', () =>
    withApp({}, async ({ url }) => {
      const res = await sendJson('POST', url, '/api/scans/analyse', { label: confirmedLabel() }, { Origin: TEST_ORIGIN });
      assert.equal(res.status, 401);
    }));

  it('returns the deterministic analysis and a Gemini explanation of the calculated values', () =>
    withApp({}, async ({ url, cookie, scan }) => {
      await savePrefs(url, cookie);
      const res = await analyse(url, cookie, confirmedLabel());
      assert.equal(res.status, 200);
      const { analysis, explanation } = res.json;
      assert.equal(analysis.match.version, '2.0.0');
      assert.ok(analysis.match.finalScore <= 49, 'saved milk allergen is confirmed in the ingredients');
      assert.deepEqual(analysis.match.allergenPenalty.items.map((i) => [i.id, i.tier, i.points]), [['milk', 'confirmed', 40]]);
      assert.equal(analysis.nutrients.sugar.level, 'MEDIUM');
      assert.equal(analysis.nutrients.protein.level, 'HIGH');
      assert.equal(analysis.nutrients.sodium.level, 'LOW');
      assert.equal(explanation.source, 'gemini');
      assert.equal(scan.gemini.calls.explanation, 1);
      const facts = scan.gemini.calls.requests.at(-1).parts[0].text;
      assert.ok(facts.includes(`"finalPersonalMatchScore":${analysis.match.finalScore}`));
    }));

  it('respects dietary preference and saved goals from the profile', () =>
    withApp({}, async ({ url, cookie }) => {
      const none = (await analyse(url, cookie, confirmedLabel())).json.analysis.match;
      assert.equal(none.components.preference.score, null);
      await savePrefs(url, cookie, { dietaryPreference: 'vegan', nutrientPreferences: [{ nutrient: 'protein', goal: 'higher', weight: 3 }], allergens: [], customAllergens: [] });
      const vegan = (await analyse(url, cookie, confirmedLabel())).json.analysis.match;
      assert.equal(vegan.components.preference.score, 100);
      assert.ok(vegan.details.ingredient.dietConflicts.length > 0);
      assert.equal(vegan.allergenPenalty.total, 0);
    }));

  it('still returns calculations and rule-based explanations when Gemini fails or is out of quota', () =>
    withApp({ scanOptions: { gemini: createFakeGemini({ explanation: new GeminiError('GEMINI_QUOTA', 'q') }) } }, async ({ url, cookie }) => {
      await savePrefs(url, cookie);
      const res = await analyse(url, cookie, confirmedLabel());
      assert.equal(res.status, 200);
      assert.equal(res.json.explanation.source, 'rules');
      assert.equal(res.json.explanation.fallbackReason, 'GEMINI_QUOTA');
      assert.match(res.json.explanation.content.personalMatchExplanation, /final Personal Match Score is \d+ out of 100/);
      assert.ok(res.json.analysis.match.finalScore !== null);
    }));

  it('works with no Gemini key at all', () =>
    withApp({ scanOptions: { gemini: createFakeGemini({ isConfigured: false }) } }, async ({ url, cookie }) => {
      const res = await analyse(url, cookie, confirmedLabel());
      assert.equal(res.status, 200);
      assert.equal(res.json.explanation.fallbackReason, 'GEMINI_NOT_CONFIGURED');
    }));

  it('does not let Gemini change numbers: a made-up score makes it fall back to rules', () =>
    withApp({ scanOptions: { gemini: createFakeGemini({ explanation: { ...sampleExplanation(), personalMatchExplanation: 'Final score is 97 out of 100.' } }) } }, async ({ url, cookie }) => {
      const res = await analyse(url, cookie, confirmedLabel());
      assert.equal(res.json.explanation.source, 'rules');
      assert.equal(res.json.explanation.fallbackReason, 'UNVERIFIED_NUMBERS');
    }));

  it('returns 422 with field issues for invalid values and never scores them', () =>
    withApp({}, async ({ url, cookie, scan }) => {
      const bad = labelWith({ sugar: 30, carbohydrates: 10, protein: -4, sodium: 'lots' });
      const res = await analyse(url, cookie, bad);
      assert.equal(res.status, 422);
      assert.equal(res.json.error.code, 'LABEL_INVALID');
      const codes = res.json.error.details.issues.map((i) => i.code);
      assert.ok(codes.includes('NEGATIVE_VALUE') && codes.includes('INVALID_TYPE'));
      assert.equal(scan.gemini.calls.explanation, 0);
    }));

  it('gives no score for too little data but still shows classifications and allergens', () =>
    withApp({}, async ({ url, cookie }) => {
      await savePrefs(url, cookie);
      const label = labelWith({ sugar: 3, protein: 5 }, { ingredientsText: 'Milk, Soy', allergenInfo: { contains: [], mayContain: [], complete: true } });
      const res = await analyse(url, cookie, label);
      assert.equal(res.status, 200);
      assert.equal(res.json.analysis.match.finalScore, null);
      assert.equal(res.json.analysis.match.status, 'insufficient_data');
      assert.equal(res.json.analysis.nutrients.sugar.level, 'LOW');
      assert.equal(res.json.analysis.match.allergenPenalty.items.length, 2);
    }));

  it('rejects a missing or non-object label', () =>
    withApp({}, async ({ url, cookie }) => {
      for (const body of [{}, { label: 'x' }, { label: [] }, { label: null }]) {
        assert.equal((await sendJson('POST', url, '/api/scans/analyse', body, auth(cookie))).status, 400);
      }
    }));

  it('rejects requests from another origin', () =>
    withApp({}, async ({ url, cookie }) => {
      const res = await sendJson('POST', url, '/api/scans/analyse', { label: confirmedLabel() }, { Cookie: cookie, Origin: 'https://evil.example' });
      assert.equal(res.status, 403);
    }));
});

describe('saved scans, history and dashboard', () => {
  it('saves a scan with component scores and the allergen result, recalculated by the server', () =>
    withApp({}, async ({ url, cookie }) => {
      await savePrefs(url, cookie);
      const label = confirmedLabel();
      const { analysis, explanation } = (await analyse(url, cookie, label)).json;
      const res = await save(url, cookie, { label, explanation });
      assert.equal(res.status, 201);
      const { scan } = res.json;
      assert.equal(scan.finalScore, analysis.match.finalScore);
      assert.equal(scan.analysis.match.components.quality.score, analysis.match.components.quality.score);
      assert.equal(scan.analysis.match.allergenPenalty.total, 40);
      assert.equal(scan.allergenConflict, true);
      assert.equal(scan.explanation.source, 'gemini');
      assert.equal('user' in scan, false);
      const detail = await get(url, cookie, `/api/scans/${scan.id}`);
      assert.equal(detail.json.scan.analysis.match.finalScore, analysis.match.finalScore);
    }));

  it('ignores a tampered explanation: unverifiable numbers are replaced by the rule-based text', () =>
    withApp({}, async ({ url, cookie }) => {
      const label = confirmedLabel();
      const forged = { source: 'gemini', content: { ...sampleExplanation(), personalMatchExplanation: 'Score 97 out of 100, perfectly safe.' } };
      const { scan } = (await save(url, cookie, { label, explanation: forged })).json;
      assert.equal(scan.explanation.source, 'rules');
      assert.doesNotMatch(JSON.stringify(scan.explanation), /perfectly safe/);
    }));

  it('never trusts scores sent by the client', () =>
    withApp({}, async ({ url, cookie }) => {
      const label = { ...confirmedLabel(), finalScore: 100, analysis: { match: { finalScore: 100 } } };
      const { scan } = (await save(url, cookie, { label })).json;
      assert.ok(scan.finalScore < 100);
      assert.equal('finalScore' in scan.label, false);
    }));

  it('lists history newest first and returns summaries only', () =>
    withApp({}, async ({ url, cookie }) => {
      for (const name of ['First', 'Second', 'Third']) await save(url, cookie, { label: { ...confirmedLabel(), productName: name } });
      const res = await get(url, cookie, '/api/scans');
      assert.deepEqual(res.json.scans.map((s) => s.productName), ['Third', 'Second', 'First']);
      assert.equal('analysis' in res.json.scans[0], false);
      assert.equal(typeof res.json.scans[0].finalScore, 'number');
    }));

  it('keeps scans private to their owner (list, read, delete, compare)', () =>
    withApp({}, async ({ url, cookie }) => {
      const mine = (await save(url, cookie, { label: confirmedLabel() })).json.scan;
      const other = await signUp(url, { name: 'Other Person', email: 'other@example.com', password: 'Passw0rdOK' });
      assert.deepEqual((await get(url, other.cookie, '/api/scans')).json.scans, []);
      assert.equal((await get(url, other.cookie, `/api/scans/${mine.id}`)).status, 404);
      assert.equal((await request(url, `/api/scans/${mine.id}`, { method: 'DELETE', headers: auth(other.cookie) })).status, 404);
      const theirs = (await save(url, other.cookie, { label: confirmedLabel() })).json.scan;
      assert.equal((await get(url, other.cookie, `/api/scans/compare?a=${mine.id}&b=${theirs.id}`)).status, 404);
      assert.equal((await get(url, cookie, `/api/scans/${mine.id}`)).status, 200);
    }));

  it('requires login for every scan route', () =>
    withApp({}, async ({ url }) => {
      for (const path of ['/api/scans', '/api/scans/summary', '/api/scans/compare?a=1&b=2', '/api/scans/abc', '/api/scans/options']) {
        assert.equal((await request(url, path)).status, 401, path);
      }
    }));

  it('deletes a scan and then returns 404', () =>
    withApp({}, async ({ url, cookie }) => {
      const { scan } = (await save(url, cookie, { label: confirmedLabel() })).json;
      assert.equal((await request(url, `/api/scans/${scan.id}`, { method: 'DELETE', headers: auth(cookie) })).status, 204);
      assert.equal((await get(url, cookie, `/api/scans/${scan.id}`)).status, 404);
      assert.equal((await request(url, `/api/scans/${scan.id}`, { method: 'DELETE', headers: auth(cookie) })).status, 404);
    }));

  it('rejects invalid labels on save and enforces the per-user limit', () =>
    withApp({ scanOptions: { maxSavedScans: 2 } }, async ({ url, cookie }) => {
      assert.equal((await save(url, cookie, { label: labelWith({ sugar: -1 }) })).status, 422);
      assert.equal((await save(url, cookie, {})).status, 400);
      assert.equal((await save(url, cookie, { label: confirmedLabel() })).status, 201);
      assert.equal((await save(url, cookie, { label: confirmedLabel() })).status, 201);
      const third = await save(url, cookie, { label: confirmedLabel() });
      assert.equal(third.status, 409);
      assert.equal(third.json.error.code, 'SCAN_LIMIT_REACHED');
    }));

  it('shows dashboard statistics', () =>
    withApp({}, async ({ url, cookie }) => {
      assert.equal((await get(url, cookie, '/api/scans/summary')).json.summary.total, 0);
      await save(url, cookie, { label: confirmedLabel() }); // no allergens saved: scored, clean
      await save(url, cookie, { label: labelWith({ sugar: 3 }) }); // too little data: unscored
      await savePrefs(url, cookie, { ...validPreferences, nutrientPreferences: [] });
      await save(url, cookie, { label: confirmedLabel() }); // milk conflict
      const { summary } = (await get(url, cookie, '/api/scans/summary')).json;
      assert.equal(summary.total, 3);
      assert.equal(summary.bands.unscored, 1);
      assert.equal(summary.allergenConflicts, 1);
      assert.equal(summary.recent.length, 3);
      assert.equal(typeof summary.averageScore, 'number');
    }));
});

describe('GET /api/scans/compare', () => {
  it('re-scores both products with the same functions and the current profile', () =>
    withApp({}, async ({ url, cookie }) => {
      await savePrefs(url, cookie, { dietaryPreference: 'none', nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 3 }], allergens: ['peanuts'], customAllergens: [] });
      const clean = labelWith(GOOD_NUTRIENTS, { productName: 'Clean Oats' });
      const sugary = labelWith({ sugar: 30, protein: 2, fibre: 0.5, sodium: 700, fat: 20, saturatedFat: 9, carbohydrates: 60 }, { productName: 'Sugary Bar', ingredientsText: 'Sugar, Glucose syrup, Peanuts' });
      const a = (await save(url, cookie, { label: clean })).json.scan;
      const b = (await save(url, cookie, { label: sugary })).json.scan;
      const res = await get(url, cookie, `/api/scans/compare?a=${a.id}&b=${b.id}`);
      assert.equal(res.status, 200);
      const { comparison } = res.json;
      assert.equal(comparison.winner, 'a');
      assert.equal(comparison.a.analysis.match.finalScore, a.finalScore, 'same function, same score as when saved');
      assert.equal(comparison.b.analysis.match.finalScore, b.finalScore);
      assert.ok(comparison.notes.some((n) => /Second product has a confirmed allergen conflict/.test(n)));
      // Changing the profile changes the comparison, using the same calculation.
      await savePrefs(url, cookie, { dietaryPreference: 'none', nutrientPreferences: [], allergens: [], customAllergens: [] });
      const again = (await get(url, cookie, `/api/scans/compare?a=${a.id}&b=${b.id}`)).json.comparison;
      assert.equal(again.b.analysis.match.allergenPenalty.total, 0);
    }));

  it('rejects missing, identical or unknown ids and notes unscored products', () =>
    withApp({}, async ({ url, cookie }) => {
      const a = (await save(url, cookie, { label: confirmedLabel() })).json.scan;
      const thin = (await save(url, cookie, { label: labelWith({ sugar: 3 }) })).json.scan;
      assert.equal((await get(url, cookie, '/api/scans/compare')).status, 400);
      assert.equal((await get(url, cookie, `/api/scans/compare?a=${a.id}&b=${a.id}`)).status, 400);
      assert.equal((await get(url, cookie, `/api/scans/compare?a=${a.id}&b=nope`)).status, 404);
      const res = await get(url, cookie, `/api/scans/compare?a=${a.id}&b=${thin.id}`);
      assert.equal(res.json.comparison.winner, null);
      assert.ok(res.json.comparison.notes.some((n) => /too little nutrition data/.test(n)));
    }));
});

describe('GET /api/scans/options and limits', () => {
  it('returns the upload limits', () =>
    withApp({ uploadMaxBytes: 2 * 1024 * 1024 }, async ({ url, cookie }) => {
      const res = await get(url, cookie, '/api/scans/options');
      assert.deepEqual(res.json.options, { maxUploadBytes: 2097152, maxUploadMb: 2, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] });
    }));
  it('rate-limits extraction (each call uses Gemini quota)', () =>
    withApp({ extractRateLimit: { windowMs: 60_000, max: 2 } }, async ({ url, cookie, scan }) => {
      assert.equal((await uploadImage(url, cookie, png())).status, 200);
      assert.equal((await uploadImage(url, cookie, png())).status, 200);
      assert.equal((await uploadImage(url, cookie, png())).status, 429);
      assert.equal(scan.gemini.calls.extraction, 2);
    }));
  it('limits uploads in flight', () =>
    withApp({ maxInFlightUploads: 1, scanOptions: { gemini: createFakeGemini({ extraction: async () => { await new Promise((r) => setTimeout(r, 150)); return sampleGeminiRaw(); } }) } }, async ({ url, cookie }) => {
      const [a, b] = await Promise.all([uploadImage(url, cookie, png()), (async () => { await new Promise((r) => setTimeout(r, 30)); return uploadImage(url, cookie, png(1)); })()]);
      assert.deepEqual([a.status, b.status].sort(), [200, 503]);
    }));
});
