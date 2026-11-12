import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyseLabel } from '../../ai/analysis/analyseLabel.js';
import { applyAllergenPenalty, computeAllergenPenalty } from '../../ai/scoring/allergenPenalty.js';
import { detectAllergens } from '../../ai/allergens/allergenDetector.js';
import { GOOD_NUTRIENTS, labelWith, profileWith } from './helpers-labels.js';

const a = (id, label = id) => ({ id, label });

describe('allergen penalty (pure rules)', () => {
  it('no conflict: no penalty, no ceiling', () => {
    const p = computeAllergenPenalty({ status: 'complete' });
    assert.equal(p.total, 0);
    assert.equal(applyAllergenPenalty(88, p).finalScore, 88);
  });
  it('one confirmed allergen: -40 and score ceiling 49', () => {
    const p = computeAllergenPenalty({ confirmed: [a('milk')] });
    assert.equal(p.total, 40);
    assert.equal(applyAllergenPenalty(95, p).finalScore, 49);
    assert.equal(applyAllergenPenalty(95, p).ceilingApplied, true);
    assert.equal(applyAllergenPenalty(80, p).finalScore, 40);
    assert.equal(applyAllergenPenalty(80, p).ceilingApplied, false);
  });
  it('multiple confirmed allergens: -40 each', () => {
    const p = computeAllergenPenalty({ confirmed: [a('milk'), a('soy')] });
    assert.equal(p.total, 60); // 2 x 40 = 80, capped at 60
    assert.equal(p.uncappedTotal, 80);
    assert.equal(p.capApplied, true);
  });
  it('one cross-contamination warning: -15, no ceiling', () => {
    const p = computeAllergenPenalty({ precautionary: [a('peanuts')] });
    assert.equal(p.total, 15);
    assert.equal(p.ceiling, null);
    assert.equal(applyAllergenPenalty(90, p).finalScore, 75);
  });
  it('multiple cross-contamination warnings: -15 each', () => {
    const p = computeAllergenPenalty({ precautionary: [a('peanuts'), a('soy'), a('milk')] });
    assert.equal(p.total, 45);
  });
  it('both confirmed and precautionary', () => {
    const p = computeAllergenPenalty({ confirmed: [a('milk')], precautionary: [a('peanuts')] });
    assert.equal(p.total, 55);
    assert.equal(p.hasConfirmedConflict, true);
    assert.equal(applyAllergenPenalty(100, p).finalScore, 45);
  });
  it('incomplete or unavailable information: -10 once', () => {
    for (const status of ['incomplete', 'unavailable']) {
      const p = computeAllergenPenalty({ status });
      assert.equal(p.total, 10);
      assert.equal(p.incompletePoints, 10);
    }
    assert.equal(computeAllergenPenalty({ status: 'complete' }).total, 0);
    assert.equal(computeAllergenPenalty({ status: 'incomplete', hasSavedAllergens: false }).total, 0);
  });
  it('does not double count the same allergen', () => {
    const p = computeAllergenPenalty({ confirmed: [a('milk'), a('milk')], precautionary: [a('milk'), a('peanuts'), a('peanuts')] });
    assert.deepEqual(p.items.map((i) => [i.id, i.tier]), [['milk', 'confirmed'], ['peanuts', 'precautionary']]);
    assert.equal(p.total, 55);
  });
  it('caps the total at 60', () => {
    const p = computeAllergenPenalty({ confirmed: [a('milk')], precautionary: [a('soy'), a('peanuts')], status: 'incomplete' });
    assert.equal(p.uncappedTotal, 80);
    assert.equal(p.total, 60);
    assert.equal(p.capApplied, true);
  });
  it('final score is never below zero and null base stays null', () => {
    const p = computeAllergenPenalty({ confirmed: [a('milk'), a('soy')] });
    assert.equal(applyAllergenPenalty(20, p).finalScore, 0);
    assert.equal(applyAllergenPenalty(0, p).finalScore, 0);
    assert.equal(applyAllergenPenalty(null, p).finalScore, null);
  });
});

describe('allergen detection and penalties through the full analysis', () => {
  const nutrients = GOOD_NUTRIENTS;
  const run = (labelOverrides, profile) => analyseLabel({ label: labelWith(nutrients, labelOverrides), profile: profileWith(profile) });
  const info = (extra) => ({ contains: [], mayContain: [], complete: true, ...extra });

  it('no conflict: complete label, saved allergens not present', () => {
    const r = run({ ingredientsText: 'Rolled oats, Rice flour, Salt' }, { allergens: ['milk', 'peanuts'] });
    assert.equal(r.match.allergens.status, 'complete');
    assert.equal(r.match.allergenPenalty.total, 0);
    assert.equal(r.match.finalScore, Math.round(r.match.baseScore));
  });
  it('one confirmed allergen from the ingredient list', () => {
    const r = run({ ingredientsText: 'Rolled oats, Milk solids, Salt' }, { allergens: ['milk'] });
    assert.deepEqual(r.match.allergenPenalty.items.map((i) => [i.id, i.tier, i.points]), [['milk', 'confirmed', 40]]);
    assert.ok(r.match.finalScore <= 49);
  });
  it('a high score never overrides a confirmed conflict (ceiling 49)', () => {
    const r = run({ ingredientsText: 'Rolled oats, Milk solids' }, { allergens: ['milk'], nutrientPreferences: [{ nutrient: 'protein', goal: 'higher', weight: 3 }] });
    assert.ok(r.match.baseScore > 80, String(r.match.baseScore));
    assert.ok(r.match.finalScore <= 49);
  });
  it('multiple confirmed allergens (declared and ingredient) are each counted once', () => {
    const r = run({ ingredientsText: 'Wheat flour, Soy protein, Sugar', allergenInfo: info({ contains: ['Wheat', 'Soya', 'Milk'] }) }, { allergens: ['gluten', 'soy', 'milk'] });
    const ids = r.match.allergenPenalty.items.map((i) => i.id).sort();
    assert.deepEqual(ids, ['gluten', 'milk', 'soy']);
    assert.equal(r.match.allergenPenalty.uncappedTotal, 120);
    assert.equal(r.match.allergenPenalty.total, 60);
    assert.ok(r.match.finalScore <= 49);
  });
  it('one "may contain" warning is precautionary (-15) with no ceiling', () => {
    const r = run({ allergenInfo: info({ mayContain: ['Peanuts'] }) }, { allergens: ['peanuts'] });
    assert.deepEqual(r.match.allergenPenalty.items.map((i) => [i.id, i.tier, i.points]), [['peanuts', 'precautionary', 15]]);
    assert.equal(r.match.allergenPenalty.hasConfirmedConflict, false);
    assert.equal(r.match.finalScore, Math.round(r.match.baseScore - 15));
  });
  it('multiple "may contain" warnings', () => {
    const r = run({ allergenInfo: info({ mayContain: ['Peanuts', 'Tree nuts', 'Sesame'] }) }, { allergens: ['peanuts', 'treeNuts', 'sesame'] });
    assert.equal(r.match.allergenPenalty.total, 45);
  });
  it('confirmed and precautionary together', () => {
    const r = run({ ingredientsText: 'Oats, Butter', allergenInfo: info({ mayContain: ['Soy'] }) }, { allergens: ['milk', 'soy'] });
    assert.equal(r.match.allergenPenalty.total, 55);
    assert.ok(r.match.finalScore <= 49);
  });
  it('a precautionary mention of an allergen that is also an ingredient counts once, as confirmed', () => {
    const r = run({ ingredientsText: 'Oats, Milk powder', allergenInfo: info({ mayContain: ['Milk'] }) }, { allergens: ['milk'] });
    assert.deepEqual(r.match.allergenPenalty.items.map((i) => [i.id, i.tier]), [['milk', 'confirmed']]);
    assert.equal(r.match.allergenPenalty.total, 40);
  });
  it('incomplete allergen information: -10 once and a safety message', () => {
    const r = run({ ingredientsText: 'Oats, Rice', allergenInfo: info({ complete: false }) }, { allergens: ['milk'] });
    assert.equal(r.match.allergens.status, 'incomplete');
    assert.equal(r.match.allergenPenalty.incompletePoints, 10);
    assert.ok(r.match.limitations.some((l) => /safety could not be established/i.test(l)));
  });
  it('unavailable allergen information (no ingredients, no statements)', () => {
    const r = run({ ingredientsText: null, allergenInfo: info({ complete: null }) }, { allergens: ['milk'] });
    assert.equal(r.match.allergens.status, 'unavailable');
    assert.equal(r.match.allergenPenalty.total, 10);
  });
  it('no incomplete penalty when the label is complete and clean', () => {
    const r = run({}, { allergens: ['milk'] });
    assert.equal(r.match.allergenPenalty.incompletePoints, 0);
  });
  it('duplicate detection: Soya + soy lecithin + declared soy is one allergen', () => {
    const r = run({ ingredientsText: 'Soya flour, Soy lecithin', allergenInfo: info({ contains: ['Soya', 'soy'] }) }, { allergens: ['soy'] });
    assert.equal(r.match.allergenPenalty.items.length, 1);
    assert.equal(r.match.allergenPenalty.total, 40);
  });
  it('penalty cap at 60 and score never below zero', () => {
    const r = analyseLabel({ label: labelWith({ sugar: 40, protein: 1, fibre: 0, sodium: 900, fat: 30, saturatedFat: 15, carbohydrates: 60 }, { ingredientsText: 'Sugar, Milk, Soy, Wheat, Peanuts', allergenInfo: info() }), profile: profileWith({ allergens: ['milk', 'soy', 'gluten', 'peanuts'] }) });
    assert.equal(r.match.allergenPenalty.total, 60);
    assert.equal(r.match.allergenPenalty.capApplied, true);
    assert.ok(r.match.finalScore >= 0);
  });
  it('only the user\'s saved allergens are penalised, but others are still detected', () => {
    const r = run({ ingredientsText: 'Oats, Milk powder, Peanut oil' }, { allergens: ['milk'] });
    assert.deepEqual(r.match.allergenPenalty.items.map((i) => i.id), ['milk']);
    assert.ok(r.match.allergens.detected.some((d) => d.id === 'peanuts' && !d.matchesUser));
  });
  it('ingredient-derived possible concerns are reported but not penalised', () => {
    const r = run({ ingredientsText: 'Wheat flour, Lecithin' }, { allergens: ['soy'] });
    assert.equal(r.match.allergenPenalty.total, 0);
    assert.deepEqual(r.match.allergens.possible.map((d) => d.id), ['soy']);
  });
  it('custom allergens are matched in ingredients and "may contain"', () => {
    const r = run({ ingredientsText: 'Oats, Mustard seed', allergenInfo: info({ mayContain: ['celery'] }) }, { customAllergens: ['Mustard', 'Celery'] });
    assert.deepEqual(r.match.allergenPenalty.items.map((i) => [i.label, i.tier]).sort(), [['Celery', 'precautionary'], ['Mustard', 'confirmed']]);
  });
  it('does not treat coconut milk or cocoa butter as milk', () => {
    const r = run({ ingredientsText: 'Coconut milk, Cocoa butter, Sugar' }, { allergens: ['milk'] });
    assert.equal(r.match.allergenPenalty.total, 0);
  });
  it('parses inline "Contains:" and "May contain" sentences out of the ingredient text', () => {
    const d = detectAllergens({ label: labelWith({}, { ingredientsText: 'Wheat flour, Sugar. Contains: Wheat, Milk. May contain traces of nuts.', allergenInfo: info() }), profile: profileWith({ allergens: ['milk', 'treeNuts'] }) });
    assert.deepEqual(d.confirmed.map((x) => x.id), ['milk']); // wheat is detected but not in the saved allergens
    assert.ok(d.detected.some((x) => x.id === 'gluten' && !x.matchesUser));
    assert.deepEqual(d.precautionary.map((x) => x.id), ['treeNuts']);
  });
  it('"Contains permitted natural colours" is not an allergen statement', () => {
    const d = detectAllergens({ label: labelWith({}, { ingredientsText: 'Sugar, Water. Contains permitted natural colours.' }), profile: profileWith({ allergens: ['milk'] }) });
    assert.equal(d.detected.length, 0);
  });
});
