import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyForm, formToLabel, hasErrors, issuesByField, labelToForm, parseList, quickCheck, scoreTone, toNumberOrRaw } from './labelForm.js';

describe('label form helpers', () => {
  it('keeps missing values as null, never zero', () => {
    const label = formToLabel(emptyForm());
    assert.equal(label.per100g.sugar, null);
    assert.equal(label.perServing.protein, null);
    assert.equal(label.servingSize.value, null);
    assert.equal(label.servingSize.unit, null);
    assert.equal(label.allergenInfo.complete, null);
  });
  it('keeps an explicit 0 as 0', () => {
    const form = emptyForm();
    form.per100g.transFat = '0';
    assert.equal(formToLabel(form).per100g.transFat, 0);
  });
  it('round-trips a label through the form', () => {
    const label = { productName: 'Oats', brand: 'X', servingSize: { value: 30, unit: 'g' }, per100g: { sugar: 8.5, sodium: 100 }, perServing: { sugar: 2.55 }, ingredientsText: 'Oats, Salt', allergenInfo: { contains: ['Milk', 'Soy'], mayContain: ['Peanuts'], complete: true }, foodTypeMark: 'veg' };
    const back = formToLabel(labelToForm(label));
    assert.equal(back.productName, 'Oats');
    assert.equal(back.per100g.sugar, 8.5);
    assert.equal(back.per100g.fat, null);
    assert.deepEqual(back.allergenInfo, { contains: ['Milk', 'Soy'], mayContain: ['Peanuts'], complete: true });
    assert.equal(back.servingSize.value, 30);
    assert.equal(back.foodTypeMark, 'veg');
  });
  it('passes non-numeric text through so the server can flag it', () => {
    assert.equal(toNumberOrRaw(' 12.5 '), 12.5);
    assert.equal(toNumberOrRaw('abc'), 'abc');
    assert.equal(toNumberOrRaw(''), null);
    assert.equal(toNumberOrRaw('-3'), -3);
  });
  it('pre-checks obvious mistakes', () => {
    const form = emptyForm();
    form.per100g.sugar = 'lots';
    assert.deepEqual(quickCheck(form), ['Total sugar must be a number.']);
    assert.deepEqual(quickCheck(emptyForm()), []);
  });
  it('parses allergen lists without duplicates', () => {
    assert.deepEqual(parseList('Milk, soy; Milk\nWheat, '), ['Milk', 'soy', 'Wheat']);
  });
  it('groups server issues by field', () => {
    const issues = [{ field: 'per100g.sugar', severity: 'error', message: 'a' }, { field: 'per100g.sugar', severity: 'warning', message: 'b' }];
    assert.equal(issuesByField(issues)['per100g.sugar'].length, 2);
    assert.equal(hasErrors(issues), true);
    assert.equal(hasErrors([{ severity: 'warning' }]), false);
  });
  it('maps scores to tones', () => {
    assert.deepEqual([null, 20, 49, 50, 69, 70, 100].map(scoreTone), ['none', 'poor', 'poor', 'fair', 'fair', 'good', 'good']);
  });
  it('uses ml when the serving unit is ml', () => {
    const form = emptyForm();
    form.servingValue = '200';
    form.servingUnit = 'ml';
    const label = formToLabel(form);
    assert.equal(label.per100Unit, 'ml');
    assert.deepEqual(label.servingSize, { value: 200, unit: 'ml' });
  });
});
