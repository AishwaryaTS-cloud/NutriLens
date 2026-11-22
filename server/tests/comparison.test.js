import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyseLabel } from '../../ai/analysis/analyseLabel.js';
import { compareProducts } from '../../ai/comparison/compareProducts.js';
import { GOOD_NUTRIENTS, labelWith, profileWith } from './helpers-labels.js';
import { sendJson, signUp, makeTestApp, withServer, TEST_ORIGIN } from './helpers.js';

const item = (name, label, profile) => {
  const analysis = analyseLabel({ label, profile });
  assert.ok(analysis.ok, `${name} should be valid: ${JSON.stringify(analysis.issues)}`);
  return { name, analysis };
};
const compare = (la, lb, profile = profileWith()) => compareProducts({ a: item('Product A', la, profile), b: item('Product B', lb, profile), profile });
const row = (result, key) => result.nutrients.find((r) => r.key === key);

const LEAN = { energyKcal: 120, sugar: 2, protein: 14, fibre: 6, sodium: 90, fat: 3, saturatedFat: 0.8, carbohydrates: 18 };
const SWEET = { energyKcal: 410, sugar: 32, protein: 4, fibre: 1, sodium: 420, fat: 18, saturatedFat: 9, carbohydrates: 58 };

describe('compareProducts: nutrients', () => {
  it('shows actual values and units, and judges direction per nutrient (not "lower is always better")', () => {
    const r = compare(labelWith(LEAN), labelWith(SWEET));
    assert.deepEqual([r.nutrients.map((n) => n.key)].flat().slice(0, 4), ['energyKcal', 'sugar', 'addedSugar', 'protein']);
    assert.equal(row(r, 'sugar').a, 2);
    assert.equal(row(r, 'sugar').unit, 'g');
    assert.equal(row(r, 'sodium').unit, 'mg');
    assert.equal(row(r, 'energyKcal').unit, 'kcal');
    assert.equal(row(r, 'sugar').better, 'a', 'less sugar is better');
    assert.equal(row(r, 'protein').better, 'a', 'MORE protein is better: A is higher and wins');
    assert.equal(row(r, 'protein').relation, 'a_higher');
    assert.equal(row(r, 'fibre').better, 'a');
    assert.equal(row(r, 'energyKcal').better, null, 'energy is shown but never judged');
    assert.equal(row(r, 'addedSugar').better, null);
  });

  it('lets the user\'s own goal override the general direction', () => {
    const wantsMoreFat = profileWith({ nutrientPreferences: [{ nutrient: 'fat', goal: 'higher', weight: 3 }] });
    const r = compare(labelWith(LEAN), labelWith(SWEET), wantsMoreFat);
    assert.equal(row(r, 'fat').direction, 'higher');
    assert.equal(row(r, 'fat').directionSource, 'goal');
    assert.equal(row(r, 'fat').better, 'b');
    const defaults = compare(labelWith(LEAN), labelWith(SWEET));
    assert.equal(row(defaults, 'fat').directionSource, 'guidance');
    assert.equal(row(defaults, 'fat').better, 'a');
  });

  it('treats near-identical values as similar and names no better product', () => {
    const r = compare(labelWith({ ...LEAN, sugar: 2.0 }), labelWith({ ...LEAN, sugar: 2.3 }));
    assert.equal(row(r, 'sugar').relation, 'similar');
    assert.equal(row(r, 'sugar').better, null);
  });

  it('handles missing values: no comparison, no verdict, and says which product lacks it', () => {
    const r = compare(labelWith({ ...LEAN, energyKcal: null, fibre: null }), labelWith(SWEET));
    assert.equal(row(r, 'fibre').relation, 'unknown');
    assert.equal(row(r, 'fibre').better, null);
    assert.deepEqual(row(r, 'fibre').missing, ['a']);
    assert.ok(r.notes.some((n) => /^Missing for Product A, so they can’t be compared: Energy and Dietary fibre\.$/.test(n)), JSON.stringify(r.notes));
    assert.ok(!r.summary.some((s) => /fibre/i.test(s.text)), 'no claim about a nutrient that is missing');
  });

  it('does not judge nutrients when one product is per 100 g and the other per 100 ml', () => {
    const r = compare(labelWith(LEAN), labelWith(SWEET, { per100Unit: 'ml' }));
    assert.equal(r.basis.mismatch, true);
    assert.ok(r.nutrients.every((n) => n.better === null));
    assert.ok(r.notes.some((n) => /per 100 g and the other per 100 ml/.test(n)));
  });
});

describe('compareProducts: ingredients', () => {
  it('splits common, only-A and only-B ingredients and ignores case and percentages', () => {
    const r = compare(
      labelWith(LEAN, { ingredientsText: 'Rolled oats, Sugar (10%), Salt, Almonds' }),
      labelWith(SWEET, { ingredientsText: 'wheat flour, SUGAR, salt, Palm oil' }),
    );
    assert.deepEqual(r.ingredients.common.map((x) => x.toLowerCase()).sort(), ['salt', 'sugar']);
    assert.deepEqual(r.ingredients.onlyA, ['Rolled oats', 'Almonds']);
    assert.deepEqual(r.ingredients.onlyB, ['wheat flour', 'Palm oil']);
    assert.equal(r.ingredients.firstIngredient.a, 'Rolled oats');
    assert.equal(r.ingredients.counts.b, 4);
  });

  it('reports important differences only when one product has them', () => {
    const r = compare(labelWith(LEAN, { ingredientsText: 'Rolled oats, Salt' }), labelWith(SWEET, { ingredientsText: 'Sugar, Glucose syrup, Palm oil' }));
    assert.ok(r.ingredients.flags.some((f) => f.side === 'b' && f.kind === 'concern' && /sugar/i.test(f.message)));
    assert.ok(r.ingredients.flags.every((f) => f.side !== 'a' || f.kind !== 'concern'));
  });

  it('is not comparable when a product has no ingredient list, and says so', () => {
    const r = compare(labelWith(LEAN, { ingredientsText: '' }), labelWith(SWEET));
    assert.equal(r.ingredients.comparable, false);
    assert.deepEqual(r.ingredients.available, { a: false, b: true });
    assert.deepEqual(r.ingredients.common, []);
    assert.ok(r.notes.some((n) => /No ingredient list is available for Product A/.test(n)));
  });
});

describe('compareProducts: allergens', () => {
  const profile = profileWith({ allergens: ['milk', 'peanuts'] });
  const A = labelWith(LEAN, { ingredientsText: 'Rice flour, Salt', allergenInfo: { contains: [], mayContain: ['Tree nuts'], complete: true } });
  const B = labelWith(SWEET, { ingredientsText: 'Sugar, Milk solids, Peanuts, Salt', allergenInfo: { contains: ['Milk', 'Peanuts'], mayContain: [], complete: true } });

  it('lists allergens per product, common and one-sided, using the saved allergens', () => {
    const r = compare(A, B, profile);
    assert.deepEqual(r.allergens.onlyB.map((e) => e.id).sort(), ['milk', 'peanuts']);
    assert.ok(r.allergens.onlyB.every((e) => e.matchesUser && e.tier === 'confirmed'));
    assert.deepEqual(r.allergens.onlyA.map((e) => e.id), ['treeNuts']);
    assert.equal(r.allergens.onlyA[0].matchesUser, false);
    assert.equal(r.allergens.b.conflict, true);
    assert.equal(r.allergens.a.conflict, false);
    assert.equal(r.allergens.b.relevant.length, 2);
  });

  it('puts the allergen warning first in the summary and never lets a high score hide it', () => {
    const r = compare(A, B, profile);
    assert.equal(r.summary[0].kind, 'allergen');
    assert.equal(r.summary[0].tone, 'danger');
    assert.match(r.summary[0].text, /Product B contains Milk and Peanuts, which are in your saved allergens\./);
  });

  it('shows allergens in both products as common, with each product\'s own wording', () => {
    const both = labelWith(LEAN, { allergenInfo: { contains: ['Milk'], mayContain: [], complete: true } });
    const maybe = labelWith(SWEET, { ingredientsText: 'Sugar, Salt', allergenInfo: { contains: [], mayContain: ['Milk'], complete: true } });
    const r = compare(both, maybe, profile);
    const milk = r.allergens.common.find((e) => e.id === 'milk');
    assert.equal(milk.tierTextA, 'Contains');
    assert.equal(milk.tierTextB, 'May contain');
  });

  it('warns that incomplete allergen information is not "allergen free"', () => {
    const unknown = labelWith(LEAN, { ingredientsText: '', allergenInfo: { contains: [], mayContain: [], complete: false } });
    const r = compare(unknown, B, profile);
    assert.equal(r.allergens.a.complete, false);
    assert.ok(r.summary.some((s) => s.tone === 'warn' && /Allergen information for Product A is incomplete/.test(s.text)));
  });
});

describe('compareProducts: scores and winner', () => {
  it('names the higher Personal Match Score and explains the gap from component scores', () => {
    const r = compare(labelWith(GOOD_NUTRIENTS), labelWith(SWEET));
    assert.equal(r.winner, 'a');
    assert.equal(r.scores.personal.leader, 'a');
    assert.ok(r.scores.personal.a > r.scores.personal.b);
    assert.ok(r.scores.explanation.some((t) => /Product A scores higher on Nutrition Quality/.test(t)));
    assert.match(r.summary.find((s) => s.kind === 'score').text, /Product A has the higher Personal Match Score/);
  });

  it('declares a tie rather than a winner for equal scores', () => {
    const r = compare(labelWith(GOOD_NUTRIENTS), labelWith(GOOD_NUTRIENTS));
    assert.equal(r.winner, 'tie');
  });

  it('says so in the summary when a score rests on partial data', () => {
    const partial = labelWith({ sugar: 3, protein: 9, sodium: 600, fat: 12 }, { ingredientsText: '' });
    const withGoals = profileWith({ nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 2 }] });
    const r = compare(labelWith(GOOD_NUTRIENTS), partial, withGoals);
    assert.equal(r.scores.partial.b, true);
    assert.equal(r.scores.partial.a, false);
    const line = r.summary.find((s) => s.kind === 'score');
    assert.equal(line.tone, 'warn');
    assert.match(line.text, /Product B was scored with limited information, so treat this as a guide\./);
    assert.ok(r.notes.some((n) => n.startsWith('Product B: ')), 'the real limitation text is listed under the notes');
  });

  it('never invents a winner when a product cannot be scored', () => {
    const thin = labelWith({ sugar: 3 });
    const analysisB = analyseLabel({ label: labelWith(GOOD_NUTRIENTS), profile: profileWith() });
    const analysisA = analyseLabel({ label: thin, profile: profileWith() });
    const r = compareProducts({ a: { name: 'Thin', analysis: analysisA }, b: { name: 'Full', analysis: analysisB }, profile: profileWith() });
    assert.equal(r.winner, null);
    assert.equal(r.scores.personal.leader, null);
    assert.ok(r.summary.some((s) => s.kind === 'score' && /No overall winner/.test(s.text)));
    assert.ok(!r.summary.some((s) => /higher Personal Match Score/.test(s.text)));
  });
});

describe('compareProducts: summary is generated only from data', () => {
  it('every number quoted in the summary exists in the compared data', () => {
    const r = compare(labelWith(LEAN), labelWith(SWEET));
    const known = new Set();
    for (const n of r.nutrients) { if (n.a !== null) known.add(String(n.a)); if (n.b !== null) known.add(String(n.b)); }
    for (const k of ['a', 'b']) known.add(String(r.scores.personal[k]));
    for (const s of r.summary.filter((x) => x.kind === 'nutrient' || x.kind === 'score')) {
      for (const num of s.text.match(/\d+(?:\.\d+)?/g) ?? []) assert.ok(known.has(num) || num === '100', `unexpected number ${num} in: ${s.text}`);
    }
  });

  it('uses product names and falls back to Product A / Product B', () => {
    const r = compareProducts({ a: { name: null, analysis: analyseLabel({ label: labelWith(LEAN), profile: profileWith() }) }, b: { name: '  ', analysis: analyseLabel({ label: labelWith(SWEET), profile: profileWith() }) }, profile: profileWith() });
    assert.deepEqual(r.names, { a: 'Product A', b: 'Product B' });
  });
});

describe('POST /api/scans/compare and GET /api/scans/compare details', () => {
  const auth = (cookie) => ({ Cookie: cookie, Origin: TEST_ORIGIN });
  async function withApp(fn) {
    const made = makeTestApp({});
    return withServer(made.app, async (url) => {
      const { cookie } = await signUp(url);
      return fn({ url, cookie });
    });
  }
  const save = (url, cookie, label) => sendJson('POST', url, '/api/scans', { label }, auth(cookie));

  it('GET compare now also returns the structured details', () =>
    withApp(async ({ url, cookie }) => {
      const a = (await save(url, cookie, labelWith(LEAN, { productName: 'Lean' }))).json.scan;
      const b = (await save(url, cookie, labelWith(SWEET, { productName: 'Sweet' }))).json.scan;
      const res = await fetch(`${url}/api/scans/compare?a=${a.id}&b=${b.id}`, { headers: { Cookie: cookie } });
      const { comparison } = await res.json();
      assert.equal(comparison.winner, 'a');
      assert.equal(comparison.details.names.a, 'Lean');
      assert.equal(comparison.details.winner, comparison.winner, 'one winner rule everywhere');
      assert.ok(Array.isArray(comparison.details.summary) && comparison.details.summary.length > 0);
    }));

  it('compares a newly analysed (unsaved) product with a saved scan', () =>
    withApp(async ({ url, cookie }) => {
      const saved = (await save(url, cookie, labelWith(SWEET, { productName: 'Saved Sweet' }))).json.scan;
      const res = await sendJson('POST', url, '/api/scans/compare', { a: { label: labelWith(LEAN, { productName: 'Fresh Lean' }) }, b: { scanId: saved.id } }, auth(cookie));
      assert.equal(res.status, 200);
      const { comparison } = res.json;
      assert.equal(comparison.a.saved, false);
      assert.equal(comparison.a.id, null);
      assert.equal(comparison.b.saved, true);
      assert.equal(comparison.winner, 'a');
      assert.equal(comparison.details.names.a, 'Fresh Lean');
      const list = await fetch(`${url}/api/scans`, { headers: { Cookie: cookie } });
      assert.equal((await list.json()).scans.length, 1, 'comparing never saves anything');
    }));

  it('validates the request and the label', () =>
    withApp(async ({ url, cookie }) => {
      const saved = (await save(url, cookie, labelWith(LEAN))).json.scan;
      const post = (body) => sendJson('POST', url, '/api/scans/compare', body, auth(cookie));
      assert.equal((await post({})).status, 400);
      assert.equal((await post({ a: { scanId: saved.id } })).status, 400);
      assert.equal((await post({ a: { scanId: saved.id }, b: { scanId: saved.id } })).status, 400, 'same product twice');
      assert.equal((await post({ a: { scanId: saved.id, label: {} }, b: { scanId: 'x' } })).status, 400, 'both id and label');
      assert.equal((await post({ a: { scanId: saved.id }, b: { scanId: 'nope' } })).status, 404);
      const bad = await post({ a: { scanId: saved.id }, b: { label: labelWith({ sugar: -5 }) } });
      assert.equal(bad.status, 422);
      assert.equal(bad.json.error.code, 'LABEL_INVALID');
    }));

  it('requires login and a same-origin request', () =>
    withApp(async ({ url }) => {
      const res = await sendJson('POST', url, '/api/scans/compare', { a: { scanId: '1' }, b: { scanId: '2' } }, { Origin: TEST_ORIGIN });
      assert.equal(res.status, 401);
    }));
});
