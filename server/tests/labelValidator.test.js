import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { convertToCanonical, normaliseExtraction, validateLabel } from '../../ai/nutrition/labelValidator.js';
import { sampleGeminiRaw } from './helpers.js';
import { labelWith } from './helpers-labels.js';

const codes = (result) => result.issues.map((i) => i.code);

describe('validateLabel', () => {
  it('converts per-serving values to per 100 g: V100 = (Vs / S) x 100', () => {
    const r = validateLabel({ servingSize: { value: 50, unit: 'g' }, perServing: { sugar: 4, sodium: 50 } });
    assert.equal(r.per100.sugar, 8);
    assert.equal(r.per100.sodium, 100);
    assert.equal(r.per100Source.sugar, 'converted_from_serving');
  });
  it('prefers a printed per-100 g value over converting', () => {
    const r = validateLabel({ servingSize: { value: 30, unit: 'g' }, perServing: { protein: 3 }, per100g: { protein: 10.5 } });
    assert.equal(r.per100.protein, 10.5);
    assert.equal(r.per100Source.protein, 'label_per_100');
  });
  it('never turns missing values into zero', () => {
    const r = validateLabel({ per100g: { sugar: 0, protein: null }, perServing: {} });
    assert.equal(r.per100.sugar, 0);
    assert.equal(r.per100.protein, null);
    assert.equal(r.per100.fat, null);
  });
  it('warns when per-serving values cannot be converted (no serving size)', () => {
    const r = validateLabel({ perServing: { sugar: 4 } });
    assert.ok(codes(r).includes('SERVING_SIZE_MISSING'));
    assert.equal(r.per100.sugar, null);
  });
  it('rejects wrong types, negatives and impossible ranges', () => {
    const r = validateLabel({ per100g: { sugar: 'abc', protein: -2, fat: 140, sodium: 50000, energyKcal: 1200 } });
    assert.equal(r.ok, false);
    assert.deepEqual(r.issues.filter((i) => i.severity === 'error').map((i) => i.code).sort(), ['INVALID_TYPE', 'NEGATIVE_VALUE', 'OUT_OF_RANGE', 'OUT_OF_RANGE', 'OUT_OF_RANGE']);
    assert.equal(r.label.per100g.sugar, null);
  });
  it('accepts numeric strings (from form fields) and empty strings as missing', () => {
    const r = validateLabel({ per100g: { sugar: '8.5', protein: '' } });
    assert.equal(r.ok, true);
    assert.equal(r.per100.sugar, 8.5);
    assert.equal(r.per100.protein, null);
  });
  it('checks serving size', () => {
    for (const value of [0, -5, 'x', 5000]) assert.ok(codes(validateLabel({ servingSize: { value, unit: 'g' } })).includes('SERVING_SIZE_INVALID'), String(value));
    assert.ok(codes(validateLabel({ servingSize: { value: 30, unit: 'oz' } })).includes('INVALID_UNIT'));
  });
  it('checks per-serving values against the serving size', () => {
    const r = validateLabel({ servingSize: { value: 30, unit: 'g' }, perServing: { protein: 45 } });
    assert.ok(codes(r).includes('OUT_OF_RANGE'));
  });
  it('detects conflicting fields', () => {
    assert.ok(codes(validateLabel({ per100g: { sugar: 20, carbohydrates: 10 } })).includes('SUGAR_EXCEEDS_CARBS'));
    assert.ok(codes(validateLabel({ per100g: { addedSugar: 9, sugar: 5 } })).includes('ADDED_SUGAR_EXCEEDS_SUGAR'));
    assert.ok(codes(validateLabel({ per100g: { saturatedFat: 9, fat: 5 } })).includes('SAT_FAT_EXCEEDS_FAT'));
    assert.ok(codes(validateLabel({ per100g: { transFat: 3, fat: 1 } })).includes('TRANS_FAT_EXCEEDS_FAT'));
    assert.ok(codes(validateLabel({ per100g: { protein: 50, fat: 40, carbohydrates: 40 } })).includes('MACROS_EXCEED_100'));
  });
  it('tolerates label rounding (sugar 10.4 with carbs 10)', () => {
    assert.equal(validateLabel({ per100g: { sugar: 10.4, carbohydrates: 10 } }).ok, true);
  });
  it('flags swapped per-serving and per-100 g columns', () => {
    const r = validateLabel({ servingSize: { value: 50, unit: 'g' }, perServing: { sugar: 16 }, per100g: { sugar: 8 } });
    assert.equal(r.ok, false);
    assert.ok(codes(r).includes('COLUMN_MISMATCH'));
  });
  it('accepts consistent columns', () => {
    assert.equal(validateLabel({ servingSize: { value: 50, unit: 'g' }, perServing: { sugar: 4.1 }, per100g: { sugar: 8 } }).ok, true);
  });
  it('counts core nutrients and flags too little data', () => {
    const r = validateLabel({ per100g: { sugar: 5, protein: 5 } });
    assert.equal(r.coreAvailable, 2);
    assert.equal(r.sufficient, false);
    assert.ok(codes(r).includes('CORE_MISSING'));
    assert.ok(codes(validateLabel({})).includes('NO_NUTRITION_VALUES'));
  });
  it('cleans text and bounds lists', () => {
    const r = validateLabel({ productName: '  Choco\u0000 bar \u200B ', ingredientsText: 'x'.repeat(9000), allergenInfo: { contains: ['Milk', 'milk', ' ', 5, 'Soy'], mayContain: 'oops' } });
    assert.equal(r.label.productName, 'Choco bar');
    assert.equal(r.label.ingredientsText.length, 4000);
    assert.deepEqual(r.label.allergenInfo.contains, ['Milk', 'Soy']);
    assert.ok(codes(r).includes('INVALID_TYPE'));
  });
  it('is idempotent on its own output', () => {
    const first = validateLabel(labelWith({ sugar: 8, protein: 15, carbohydrates: 40 }));
    assert.deepEqual(validateLabel(first.label).label, first.label);
  });
  it('handles non-object input safely', () => {
    for (const input of [null, undefined, 5, 'x', []]) assert.doesNotThrow(() => validateLabel(input));
  });
});

describe('unit conversion of extracted values', () => {
  it('converts mg/g and kJ/kcal to the canonical units', () => {
    assert.equal(convertToCanonical('sodium', { value: 0.5, unit: 'g' }).value, 500);
    assert.equal(convertToCanonical('sodium', { value: 300, unit: 'mg' }).value, 300);
    assert.equal(convertToCanonical('sugar', { value: 500, unit: 'mg' }).value, 0.5);
    assert.equal(convertToCanonical('energyKcal', { value: 418.4, unit: 'kJ' }).value, 100);
    assert.equal(convertToCanonical('energyKcal', { value: 120, unit: 'kcal' }).value, 120);
  });
  it('rejects invalid units and values (null, with an issue)', () => {
    assert.equal(convertToCanonical('sugar', { value: 5, unit: '%' }).value, null);
    assert.equal(convertToCanonical('sugar', { value: 5, unit: '%' }).issue.code, 'INVALID_UNIT');
    assert.equal(convertToCanonical('energyKcal', { value: 5, unit: 'g' }).issue.code, 'INVALID_UNIT');
    assert.equal(convertToCanonical('sugar', { value: 'lots', unit: 'g' }).issue.code, 'AI_FIELD_INVALID');
    assert.equal(convertToCanonical('sugar', null).value, null);
    assert.equal(convertToCanonical('sugar', { value: null, unit: 'g' }).value, null);
  });
});

describe('normaliseExtraction (Gemini response -> canonical label)', () => {
  it('turns a good response into a valid label with status ok', () => {
    const r = normaliseExtraction(sampleGeminiRaw());
    assert.equal(r.status, 'ok');
    assert.equal(r.label.productName, 'Crunchy Oat Biscuits');
    assert.equal(r.label.per100g.sugar, 8);
    assert.equal(r.label.perServing.sugar, 4);
    assert.equal(r.label.servingSize.value, 50);
    assert.equal(r.label.allergenInfo.complete, true);
    assert.deepEqual(r.label.allergenInfo.contains, ['Wheat', 'Milk']);
    assert.equal(r.originalUnits['per100g.sodium'], 'mg');
  });
  it('keeps unreadable values null and reports them (partial)', () => {
    const raw = sampleGeminiRaw();
    raw.nutrition.per100g.sodium = { value: null, unit: 'mg' };
    raw.nutrition.perServing.sodium = null;
    raw.readability = { imageQuality: 'fair', unreadableFields: ['per100g.sodium'], uncertainFields: [], notes: ['Glare on the right side'] };
    const r = normaliseExtraction(raw);
    assert.equal(r.status, 'partial');
    assert.equal(r.label.per100g.sodium, null);
    assert.deepEqual(r.readability.unreadableFields, ['per100g.sodium']);
  });
  it('marks allergen information incomplete when the allergen section is unreadable', () => {
    const raw = sampleGeminiRaw();
    raw.allergens.sectionReadable = false;
    assert.equal(normaliseExtraction(raw).label.allergenInfo.complete, false);
    raw.ingredients.complete = null;
    raw.allergens.sectionReadable = null;
    assert.equal(normaliseExtraction(raw).label.allergenInfo.complete, null);
  });
  it('reports a non-label image as empty', () => {
    const r = normaliseExtraction({ isFoodLabel: false, productName: null, nutrition: {}, ingredients: {}, allergens: {}, readability: {} });
    assert.equal(r.status, 'empty');
    assert.equal(r.isFoodLabel, false);
  });
  it('turns invalid units/values from the model into null plus warnings, not zero', () => {
    const raw = sampleGeminiRaw();
    raw.nutrition.per100g.sugar = { value: 5, unit: '%' };
    raw.nutrition.per100g.protein = { value: 'many', unit: 'g' };
    const r = normaliseExtraction(raw);
    assert.equal(r.label.per100g.sugar, null);
    assert.equal(r.label.per100g.protein, null);
    assert.ok(r.issues.some((i) => i.code === 'INVALID_UNIT' && i.field === 'per100g.sugar'));
  });
  it('derives sodium from printed salt and says so', () => {
    const raw = sampleGeminiRaw();
    raw.nutrition.per100g.sodium = null;
    raw.nutrition.per100g.salt = { value: 0.25, unit: 'g' };
    const r = normaliseExtraction(raw);
    assert.equal(r.label.per100g.sodium, 100);
    assert.ok(r.issues.some((i) => i.code === 'SODIUM_DERIVED_FROM_SALT'));
  });
  it('survives garbage without throwing', () => {
    for (const raw of [null, 5, 'x', [], { nutrition: 7, allergens: 'x', ingredients: [] }]) assert.doesNotThrow(() => normaliseExtraction(raw));
  });
  it('handles multiple columns and distinguishes added sugar from total sugar', () => {
    const r = normaliseExtraction(sampleGeminiRaw());
    assert.equal(r.label.per100g.sugar, 8);
    assert.equal(r.label.per100g.addedSugar, 7);
  });
});
