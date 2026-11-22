import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { barPercent, describeNutrientRow, levelTone, relationBadge, verdictText } from './compareView.js';

const names = { a: 'Oats', b: 'Bar' };
const row = (over) => ({ key: 'sugar', unit: 'g', a: 2, b: 30, relation: 'b_higher', difference: 28, direction: 'lower', directionSource: 'goal', better: 'a', missing: [], ...over });

describe('levelTone', () => {
  it('reads LOW/HIGH according to the direction that is better', () => {
    assert.equal(levelTone('LOW', 'lower'), 'good');
    assert.equal(levelTone('HIGH', 'lower'), 'poor');
    assert.equal(levelTone('HIGH', 'higher'), 'good', 'high fibre is good');
    assert.equal(levelTone('LOW', 'higher'), 'poor');
    assert.equal(levelTone('MEDIUM', 'higher'), 'fair');
    assert.equal(levelTone('HIGH', null), 'none', 'no judgement without a direction');
    assert.equal(levelTone(null, 'lower'), 'none');
  });
});

describe('describeNutrientRow', () => {
  it('explains a lower-is-better verdict and names its basis', () => {
    const d = describeNutrientRow(row(), names);
    assert.equal(d.tone, 'good');
    assert.match(d.text, /Bar has 28 g more\. Less is better \(your goal\), so Oats comes out ahead\./);
  });
  it('explains a higher-is-better verdict', () => {
    const d = describeNutrientRow(row({ key: 'protein', a: 12, b: 4, relation: 'a_higher', difference: 8, direction: 'higher', directionSource: 'guidance', better: 'a' }), names);
    assert.match(d.text, /Oats has 8 g more\. More is better \(general guidance\), so Oats comes out ahead\./);
  });
  it('does not judge energy or other undirected nutrients', () => {
    const d = describeNutrientRow(row({ key: 'energyKcal', unit: 'kcal', direction: null, directionSource: null, better: null }), names);
    assert.equal(d.tone, 'muted');
    assert.match(d.text, /not judged/);
  });
  it('handles similar, one missing and both missing', () => {
    assert.match(describeNutrientRow(row({ relation: 'similar', better: null }), names).text, /About the same/);
    assert.match(describeNutrientRow(row({ a: null, relation: 'unknown', missing: ['a'], better: null }), names).text, /Not available for Oats/);
    assert.match(describeNutrientRow(row({ a: null, b: null, relation: 'unknown', missing: ['a', 'b'], better: null }), names).text, /either product/);
  });
  it('says so when different bases stop a verdict', () => {
    assert.match(describeNutrientRow(row({ better: null }), names).text, /different bases/);
  });
});

describe('small helpers', () => {
  it('barPercent scales to the larger value and never draws a bar for missing data', () => {
    assert.equal(barPercent(30, 2, 30), 100);
    assert.equal(barPercent(15, 15, 30), 50);
    assert.equal(barPercent(0.1, 0.1, 100), 2, 'tiny values stay visible');
    assert.equal(barPercent(null, null, 30), 0);
    assert.equal(barPercent(0, 0, 0), 0);
  });
  it('relationBadge labels the higher and lower side only when they differ', () => {
    assert.equal(relationBadge(row(), 'a'), 'Lower');
    assert.equal(relationBadge(row(), 'b'), 'Higher');
    assert.equal(relationBadge(row({ relation: 'similar' }), 'a'), null);
    assert.equal(relationBadge(row({ relation: 'unknown' }), 'b'), null);
  });
  it('verdictText never names a winner without one', () => {
    assert.equal(verdictText('a', names), 'Better match for you: Oats');
    assert.match(verdictText('tie', names), /same Personal Match Score/);
    assert.match(verdictText(null, names), /No overall winner/);
  });
});
