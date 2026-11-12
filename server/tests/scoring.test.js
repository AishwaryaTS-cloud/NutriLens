import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyseLabel } from '../../ai/analysis/analyseLabel.js';
import { COMPONENT_WEIGHTS, GOAL_SCORES, MIN_CORE_NUTRIENTS, NUTRIENT_THRESHOLDS } from '../../ai/scoring/config.js';
import { classifyAll, classifyNutrient, computePreferenceScore, computeQualityScore, nutrientScore } from '../../ai/scoring/nutrientScores.js';
import { GOOD_NUTRIENTS, labelWith, profileWith } from './helpers-labels.js';

const near = (actual, expected, tolerance = 0.011) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

describe('classification thresholds (boundaries)', () => {
  for (const [nutrient, { low, medium }] of Object.entries(NUTRIENT_THRESHOLDS)) {
    it(`${nutrient}: <= ${low} LOW, <= ${medium} MEDIUM, above HIGH`, () => {
      assert.equal(classifyNutrient(nutrient, 0), 'LOW');
      assert.equal(classifyNutrient(nutrient, low), 'LOW');
      assert.equal(classifyNutrient(nutrient, low + 0.01), 'MEDIUM');
      assert.equal(classifyNutrient(nutrient, medium), 'MEDIUM');
      assert.equal(classifyNutrient(nutrient, medium + 0.01), 'HIGH');
    });
  }
  it('never classifies a missing or invalid value (it is not LOW)', () => {
    for (const value of [null, undefined, NaN, -1]) assert.equal(classifyNutrient('sugar', value), null);
  });
  it('classifies added sugar for information only', () => {
    const rows = classifyAll({ addedSugar: 13 });
    assert.equal(rows.addedSugar.level, 'HIGH');
    assert.equal(rows.addedSugar.scored, false);
    assert.equal(rows.sugar.level, null);
  });
});

describe('goal score table', () => {
  it('matches the documented table', () => {
    assert.deepEqual(GOAL_SCORES.lower, { LOW: 100, MEDIUM: 50, HIGH: 10 });
    assert.deepEqual(GOAL_SCORES.higher, { LOW: 20, MEDIUM: 60, HIGH: 100 });
    assert.equal(nutrientScore('sugar', 8, 'lower'), 50);
    assert.equal(nutrientScore('protein', 15, 'higher'), 100);
    assert.equal(nutrientScore('sodium', 100, 'lower'), 100);
    assert.equal(nutrientScore('sugar', null, 'lower'), null);
  });
});

describe('Personal Preference Score', () => {
  const prefs = [
    { nutrient: 'sugar', goal: 'lower', weight: 2 },
    { nutrient: 'protein', goal: 'higher', weight: 3 },
    { nutrient: 'sodium', goal: 'lower', weight: 1 },
  ];
  it('reproduces the worked example: (50x2 + 100x3 + 100x1) / 6 = 83.33', () => {
    const result = computePreferenceScore({ sugar: 8, protein: 15, sodium: 100 }, prefs);
    near(result.score, 83.33);
    assert.deepEqual(result.items.map((i) => [i.nutrient, i.level, i.score]), [['sugar', 'MEDIUM', 50], ['protein', 'HIGH', 100], ['sodium', 'LOW', 100]]);
  });
  it('leaves out nutrients with no value instead of using zero', () => {
    const result = computePreferenceScore({ sugar: 8, protein: null, sodium: 100 }, prefs);
    near(result.score, (50 * 2 + 100) / 3);
    assert.deepEqual(result.missing, ['protein']);
  });
  it('is not applicable without goals or values', () => {
    assert.equal(computePreferenceScore({ sugar: 8 }, []).score, null);
    assert.equal(computePreferenceScore({}, prefs).score, null);
  });
  it('weights change the result', () => {
    const heavy = computePreferenceScore({ sugar: 20, protein: 15 }, [{ nutrient: 'sugar', goal: 'lower', weight: 3 }, { nutrient: 'protein', goal: 'higher', weight: 1 }]);
    near(heavy.score, (10 * 3 + 100) / 4);
  });
  it('stays between 0 and 100 for every combination', () => {
    for (const goal of ['lower', 'higher']) for (const value of [0, 3, 10, 50]) {
      const { score } = computePreferenceScore({ sugar: value }, [{ nutrient: 'sugar', goal, weight: 2 }]);
      assert.ok(score >= 0 && score <= 100);
    }
  });
});

describe('Nutrition Quality Score', () => {
  it('rewards low sugar/sodium and high protein/fibre differently', () => {
    const good = computeQualityScore(GOOD_NUTRIENTS);
    const poor = computeQualityScore({ sugar: 30, protein: 1, fibre: 0.5, sodium: 900, fat: 30, saturatedFat: 12, carbohydrates: 70 });
    assert.ok(good.score > 85, String(good.score));
    assert.ok(poor.score < 15, String(poor.score));
    // High sugar is bad, high protein is good: both are HIGH but score oppositely.
    const items = computeQualityScore({ sugar: 30, protein: 30, fibre: 10, sodium: 50 }).items;
    assert.equal(items.find((i) => i.nutrient === 'sugar').score, 10);
    assert.equal(items.find((i) => i.nutrient === 'protein').score, 100);
  });
  it('is a weighted average (sugar weight 3)', () => {
    const result = computeQualityScore({ sugar: 3, protein: 15, fibre: 5, sodium: 700 });
    // sugar LOW 100x3, protein HIGH 100x2, fibre HIGH 100x2, sodium HIGH 10x2 => 720 / 9
    near(result.score, 720 / 9);
  });
  it(`needs at least ${MIN_CORE_NUTRIENTS} nutrients and never treats missing as zero`, () => {
    assert.equal(computeQualityScore({ sugar: 3, protein: 15, fibre: 5 }).score, null);
    const four = computeQualityScore({ sugar: 3, protein: 15, fibre: 5, sodium: 100 });
    assert.equal(four.applicable, true);
    assert.deepEqual(four.missing, ['fat', 'saturatedFat', 'carbohydrates']);
    assert.equal(four.score, 100);
  });
});

describe('Personal Match Score (component formula)', () => {
  const profile = profileWith({ nutrientPreferences: [{ nutrient: 'protein', goal: 'higher', weight: 3 }] });
  it('uses 0.50 / 0.30 / 0.20 and shows each contribution', () => {
    assert.deepEqual(COMPONENT_WEIGHTS, { preference: 0.5, quality: 0.3, ingredient: 0.2 });
    const r = analyseLabel({ label: labelWith(GOOD_NUTRIENTS), profile });
    const { components, baseScore } = r.match;
    near(components.preference.contribution + components.quality.contribution + components.ingredient.contribution, baseScore, 0.06);
    near(components.preference.score * 0.5, components.preference.contribution, 0.02);
    near(components.quality.score * 0.3, components.quality.contribution, 0.02);
    near(components.ingredient.score * 0.2, components.ingredient.contribution, 0.02);
    assert.equal(r.match.finalScore, Math.round(baseScore));
    assert.equal(r.match.status, 'scored');
    assert.deepEqual(r.match.limitations, []);
  });
  it('scales weights over available components and says so', () => {
    const r = analyseLabel({ label: labelWith(GOOD_NUTRIENTS), profile: profileWith() });
    assert.equal(r.match.components.preference.score, null);
    near(r.match.components.quality.weightUsed, 0.6);
    near(r.match.components.ingredient.weightUsed, 0.4);
    assert.ok(r.match.limitations.some((l) => /No nutrient goals/.test(l)));
  });
  it('gives no score (null) when there is too little nutrition data', () => {
    const r = analyseLabel({ label: labelWith({ sugar: 3, protein: 5 }), profile });
    assert.equal(r.match.finalScore, null);
    assert.equal(r.match.baseScore, null);
    assert.equal(r.match.status, 'insufficient_data');
  });
  it('keeps the final score within 0-100 for extreme labels', () => {
    for (const per100 of [{ sugar: 50, protein: 0, fibre: 0, sodium: 39000, fat: 30, saturatedFat: 15, carbohydrates: 60 }, { sugar: 0, protein: 90, fibre: 4, sodium: 0, fat: 0, saturatedFat: 0, carbohydrates: 5 }]) {
      const r = analyseLabel({ label: labelWith(per100), profile: profileWith({ allergens: ['milk'], nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 3 }] }) });
      assert.ok(r.match.finalScore >= 0 && r.match.finalScore <= 100, String(r.match.finalScore));
    }
  });
  it('rejects blocking validation errors instead of scoring', () => {
    const r = analyseLabel({ label: labelWith({ sugar: 30, carbohydrates: 10 }), profile });
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === 'SUGAR_EXCEEDS_CARBS'));
  });
  it('uses the same function for identical labels (deterministic)', () => {
    const a = analyseLabel({ label: labelWith(GOOD_NUTRIENTS), profile });
    const b = analyseLabel({ label: labelWith(GOOD_NUTRIENTS), profile });
    assert.deepEqual(a.match, b.match);
  });
});
