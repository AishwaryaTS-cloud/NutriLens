import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addCustomAllergen,
  customAllergenProblem,
  hasErrors,
  normalizeCustomAllergen,
  removeCustomAllergen,
  setNutrientField,
  setNutrientSelected,
  setOtherOpen,
  summarizeProfile,
  toFormState,
  toPayload,
  toggleAllergen,
  validateNameValue,
  validatePreferencesForm,
} from './preferencesForm.js';

const options = {
  nutrients: [
    { key: 'sugar', label: 'Sugar', unit: 'g' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'fibre', label: 'Fibre', unit: 'g' },
    { key: 'sodium', label: 'Sodium', unit: 'mg' },
    { key: 'fat', label: 'Fat', unit: 'g' },
    { key: 'saturatedFat', label: 'Saturated fat', unit: 'g' },
    { key: 'carbohydrates', label: 'Carbohydrates', unit: 'g' },
  ],
  weights: { min: 1, max: 3 },
  dietaryPreferences: [
    { key: 'vegetarian', label: 'Vegetarian' },
    { key: 'none', label: 'No specific preference' },
  ],
  allergens: [
    { key: 'milk', label: 'Milk', aliases: ['milk'] },
    { key: 'peanuts', label: 'Peanuts', aliases: ['peanut', 'peanuts', 'groundnut'] },
    { key: 'soy', label: 'Soy', aliases: ['soy', 'soya'] },
    { key: 'crustaceans', label: 'Crustaceans / shellfish', aliases: ['crustacean', 'shellfish'] },
  ],
  customAllergens: { maxEntries: 5, minLength: 3, maxLength: 40 },
};

const unconfigured = {
  dietaryPreference: 'none',
  nutrientPreferences: [],
  allergens: [],
  customAllergens: [],
  isConfigured: false,
  updatedAt: null,
};
const configured = {
  dietaryPreference: 'vegetarian',
  nutrientPreferences: [
    { nutrient: 'sugar', goal: 'lower', weight: 2 },
    { nutrient: 'protein', goal: 'higher', weight: 3 },
  ],
  allergens: ['soy', 'milk'],
  customAllergens: ['Mustard'],
  isConfigured: true,
  updatedAt: '2026-11-07T10:00:00.000Z',
};

describe('toFormState', () => {
  it('starts an unconfigured profile with nothing selected and no invented goals or weights', () => {
    const form = toFormState(unconfigured, options);
    assert.equal(form.dietaryPreference, 'none');
    assert.equal(Object.keys(form.nutrients).length, 7);
    for (const state of Object.values(form.nutrients)) {
      assert.deepEqual(state, { selected: false, goal: null, weight: null });
    }
    assert.equal(form.otherOpen, false);
    assert.deepEqual(form.allergens, []);
  });

  it('restores saved choices and opens "Other" when custom allergens exist', () => {
    const form = toFormState(configured, options);
    assert.deepEqual(form.nutrients.sugar, { selected: true, goal: 'lower', weight: 2 });
    assert.deepEqual(form.nutrients.protein, { selected: true, goal: 'higher', weight: 3 });
    assert.equal(form.nutrients.fibre.selected, false);
    assert.equal(form.otherOpen, true);
    assert.deepEqual(form.customAllergens, ['Mustard']);
  });
});

describe('toPayload', () => {
  it('sends only ticked nutrients, in the canonical order, with canonical allergen order', () => {
    const payload = toPayload(toFormState(configured, options), options);
    assert.deepEqual(payload.nutrientPreferences, [
      { nutrient: 'sugar', goal: 'lower', weight: 2 },
      { nutrient: 'protein', goal: 'higher', weight: 3 },
    ]);
    assert.deepEqual(payload.allergens, ['milk', 'soy']);
    assert.deepEqual(payload.customAllergens, ['Mustard']);
    assert.equal(payload.dietaryPreference, 'vegetarian');
  });

  it('allows a completely empty form', () => {
    assert.deepEqual(toPayload(toFormState(unconfigured, options), options), {
      dietaryPreference: 'none',
      nutrientPreferences: [],
      allergens: [],
      customAllergens: [],
    });
  });

  it('drops custom allergens when "Other" is switched off', () => {
    const form = { ...toFormState(configured, options), otherOpen: false };
    assert.deepEqual(toPayload(form, options).customAllergens, []);
  });
});

describe('validatePreferencesForm', () => {
  it('is happy with an empty form and with a complete one', () => {
    assert.equal(hasErrors(validatePreferencesForm(toFormState(unconfigured, options), options)), false);
    assert.equal(hasErrors(validatePreferencesForm(toFormState(configured, options), options)), false);
  });

  it('asks for a goal, then a weight, for each ticked nutrient', () => {
    let form = setNutrientSelected(toFormState(unconfigured, options), 'sugar', true);
    assert.equal(validatePreferencesForm(form, options)['nutrientPreferences.sugar'], 'Choose lower or higher.');
    form = setNutrientField(form, 'sugar', 'goal', 'lower');
    assert.match(validatePreferencesForm(form, options)['nutrientPreferences.sugar'], /Choose a weight from 1 to 3/);
    form = setNutrientField(form, 'sugar', 'weight', 3);
    assert.equal(hasErrors(validatePreferencesForm(form, options)), false);
  });

  it('un-ticking a nutrient forgets its goal and weight', () => {
    let form = setNutrientSelected(toFormState(configured, options), 'sugar', false);
    assert.deepEqual(form.nutrients.sugar, { selected: false, goal: null, weight: null });
    assert.equal(toPayload(form, options).nutrientPreferences.length, 1);
  });

  it('refuses to silently drop text that was typed but not added', () => {
    const form = { ...setOtherOpen(toFormState(unconfigured, options), true), customDraft: 'Mustard' };
    assert.match(validatePreferencesForm(form, options).customDraft, /Press Add/);
  });

  it('reports bad saved custom entries by position', () => {
    const form = { ...setOtherOpen(toFormState(unconfigured, options), true), customAllergens: ['Mustard', 'ab', 'Peanut'] };
    const errors = validatePreferencesForm(form, options);
    assert.equal(errors['customAllergens.0'], undefined);
    assert.ok(errors['customAllergens.1']);
    assert.match(errors['customAllergens.2'], /already in the list above/);
  });
});

describe('custom allergens', () => {
  const withDraft = (form, draft) => ({ ...form, otherOpen: true, customDraft: draft });
  const empty = () => toFormState(unconfigured, options);

  it('adds a trimmed entry, keeps the typed casing and clears the draft', () => {
    const { form, error } = addCustomAllergen(withDraft(empty(), '  Kiwi   fruit '), options);
    assert.equal(error, undefined);
    assert.deepEqual(form.customAllergens, ['Kiwi fruit']);
    assert.equal(form.customDraft, '');
  });

  it('enforces length limits', () => {
    assert.match(addCustomAllergen(withDraft(empty(), 'ab'), options).error, /at least 3/);
    assert.match(addCustomAllergen(withDraft(empty(), 'a'.repeat(41)), options).error, /40 characters or fewer/);
    assert.equal(addCustomAllergen(withDraft(empty(), 'a'.repeat(40)), options).error, undefined);
  });

  it('rejects duplicates regardless of case and spacing', () => {
    const first = addCustomAllergen(withDraft(empty(), 'Mustard'), options).form;
    assert.match(addCustomAllergen({ ...first, customDraft: ' mustard ' }, options).error, /already added/);
  });

  it('rejects predefined allergens written another way, naming the right one', () => {
    assert.match(addCustomAllergen(withDraft(empty(), 'Shellfish'), options).error, /Crustaceans \/ shellfish/);
    assert.match(addCustomAllergen(withDraft(empty(), 'SOYA'), options).error, /“Soy”/);
    assert.match(customAllergenProblem('groundnut', options), /Peanuts/);
  });

  it('still allows narrower items such as cashew', () => {
    assert.equal(customAllergenProblem('Cashew', options), undefined);
  });

  it('rejects markup, emoji and zero-width characters but accepts other scripts', () => {
    for (const bad of ['<b>x</b>', '🥜 nuts', 'mus\u200Btard', '-mustard', 'a/b/c']) {
      assert.ok(customAllergenProblem(bad, options), JSON.stringify(bad));
    }
    assert.equal(customAllergenProblem('मूंगफली', options), undefined);
  });

  it('stops at five entries', () => {
    let form = withDraft(empty(), '');
    for (const name of ['One1', 'Two2', 'Three', 'Four4', 'Five5']) {
      form = addCustomAllergen({ ...form, customDraft: name }, options).form;
    }
    assert.equal(form.customAllergens.length, 5);
    assert.match(addCustomAllergen({ ...form, customDraft: 'Six66' }, options).error, /up to 5/);
  });

  it('removes entries, and un-ticking "Other" clears them all', () => {
    let form = toFormState(configured, options);
    assert.deepEqual(removeCustomAllergen({ ...form, customAllergens: ['A1b', 'C2d'] }, 0).customAllergens, ['C2d']);
    form = setOtherOpen(form, false);
    assert.deepEqual(form.customAllergens, []);
    assert.equal(form.otherOpen, false);
  });

  it('normalises text the same way the server does', () => {
    assert.equal(normalizeCustomAllergen('  a \t b '), 'a b');
    assert.equal(normalizeCustomAllergen(5), '');
  });
});

describe('toggleAllergen', () => {
  it('adds and removes predefined allergens', () => {
    let form = toFormState(unconfigured, options);
    form = toggleAllergen(form, 'milk');
    assert.deepEqual(form.allergens, ['milk']);
    form = toggleAllergen(form, 'milk');
    assert.deepEqual(form.allergens, []);
  });
});

describe('summarizeProfile and validateNameValue', () => {
  it('summarises a configured profile in plain language', () => {
    const summary = summarizeProfile(configured, options);
    assert.equal(summary.isConfigured, true);
    assert.equal(summary.dietary, 'Vegetarian');
    assert.deepEqual(summary.nutrients, [
      { key: 'sugar', label: 'Sugar', goal: 'Lower is better', weight: 2 },
      { key: 'protein', label: 'Protein', goal: 'Higher is better', weight: 3 },
    ]);
    assert.deepEqual(summary.allergens, ['Soy', 'Milk', 'Mustard']);
  });

  it('summarises an unconfigured profile without inventing anything', () => {
    const summary = summarizeProfile(unconfigured, options);
    assert.equal(summary.isConfigured, false);
    assert.deepEqual(summary.nutrients, []);
    assert.deepEqual(summary.allergens, []);
  });

  it('checks the display name length', () => {
    assert.equal(validateNameValue('Asha Rao'), undefined);
    assert.ok(validateNameValue('A'));
    assert.ok(validateNameValue('x'.repeat(61)));
    assert.ok(validateNameValue('   '));
    assert.ok(validateNameValue(undefined));
  });
});
