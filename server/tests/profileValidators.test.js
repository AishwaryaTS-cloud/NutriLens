import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALLERGEN_KEYS } from '../config/nutrition.js';
import {
  allergenKey,
  customAllergenProblem,
  normalizeCustomAllergen,
  validatePreferences,
} from '../utils/profileValidators.js';
import { validateName } from '../utils/validators.js';

const base = { dietaryPreference: 'none', nutrientPreferences: [], allergens: [], customAllergens: [] };
const withCustom = (customAllergens) => validatePreferences({ ...base, customAllergens });

describe('validatePreferences: whole form', () => {
  it('accepts a complete valid form and returns it in canonical order', () => {
    const result = validatePreferences({
      dietaryPreference: 'pescatarian',
      nutrientPreferences: [
        { nutrient: 'sodium', goal: 'lower', weight: 1 },
        { nutrient: 'protein', goal: 'higher', weight: 3 },
        { nutrient: 'sugar', goal: 'lower', weight: 2 },
      ],
      allergens: ['soy', 'milk'],
      customAllergens: ['Mustard'],
    });
    assert.equal(result.valid, true);
    assert.deepEqual(
      result.value.nutrientPreferences.map((n) => n.nutrient),
      ['sugar', 'protein', 'sodium'],
    );
    assert.deepEqual(result.value.allergens, ['milk', 'soy']);
  });

  it('accepts a form with nothing selected (no nutrient priorities is allowed)', () => {
    const result = validatePreferences(base);
    assert.equal(result.valid, true);
    assert.deepEqual(result.value, base);
  });

  it('ignores unknown top-level fields', () => {
    const result = validatePreferences({ ...base, user: 'abc', isConfigured: false, _id: 1 });
    assert.equal(result.valid, true);
    assert.deepEqual(Object.keys(result.value).sort(), [
      'allergens',
      'customAllergens',
      'dietaryPreference',
      'nutrientPreferences',
    ]);
  });

  it('treats a missing or non-object body as invalid instead of throwing', () => {
    for (const input of [undefined, null, 'text', 5, [], [base]]) {
      const result = validatePreferences(input);
      assert.equal(result.valid, false);
      assert.ok(result.errors.dietaryPreference);
      assert.ok(result.errors.nutrientPreferences);
      assert.ok(result.errors.allergens);
      assert.ok(result.errors.customAllergens);
    }
  });
});

describe('validatePreferences: dietary preference', () => {
  it('accepts each of the five options', () => {
    for (const key of ['vegetarian', 'vegan', 'eggetarian', 'pescatarian', 'none']) {
      assert.equal(validatePreferences({ ...base, dietaryPreference: key }).valid, true, key);
    }
  });

  it('rejects anything else, including wrong case, labels and other types', () => {
    for (const bad of ['keto', 'Vegan', 'No specific preference', '', ' vegan', null, undefined, 1, ['vegan'], { a: 1 }]) {
      assert.ok(validatePreferences({ ...base, dietaryPreference: bad }).errors.dietaryPreference, String(bad));
    }
  });
});

describe('validatePreferences: nutrient priorities', () => {
  const pref = (nutrient, goal = 'lower', weight = 2) => ({ nutrient, goal, weight });
  const run = (nutrientPreferences) => validatePreferences({ ...base, nutrientPreferences });

  it('accepts all seven nutrients, with every goal and weight', () => {
    const all = ['sugar', 'protein', 'fibre', 'sodium', 'fat', 'saturatedFat', 'carbohydrates'];
    assert.equal(run(all.map((n, i) => pref(n, i % 2 ? 'higher' : 'lower', (i % 3) + 1))).valid, true);
  });

  it('rejects unknown nutrients and malformed entries', () => {
    for (const bad of [[pref('calories')], [null], ['sugar'], [{ goal: 'lower', weight: 1 }], [[]]]) {
      assert.ok(run(bad).errors.nutrientPreferences, JSON.stringify(bad));
    }
  });

  it('rejects an unknown goal, with the error on that nutrient', () => {
    assert.ok(run([pref('sugar', 'moderate')]).errors['nutrientPreferences.sugar']);
    assert.ok(run([{ nutrient: 'sugar', weight: 2 }]).errors['nutrientPreferences.sugar']);
  });

  it('accepts only whole numbers from 1 to 3 as weights', () => {
    for (const weight of [1, 2, 3]) assert.equal(run([pref('sugar', 'lower', weight)]).valid, true);
    // Entries are built explicitly: pref() would turn `undefined` into its default weight of 2.
    for (const weight of [0, 4, -1, 2.5, '2', null, undefined, NaN, Infinity, [2]]) {
      const entry = { nutrient: 'sugar', goal: 'lower', weight };
      assert.ok(run([entry]).errors['nutrientPreferences.sugar'], String(weight));
    }
    assert.ok(run([{ nutrient: 'sugar', goal: 'lower' }]).errors['nutrientPreferences.sugar'], 'missing weight');
  });

  it('rejects the same nutrient twice', () => {
    assert.ok(run([pref('sugar'), pref('sugar', 'higher', 3)]).errors['nutrientPreferences.sugar']);
  });

  it('rejects more than seven entries and non-lists', () => {
    assert.ok(run(Array.from({ length: 8 }, () => pref('sugar'))).errors.nutrientPreferences);
    for (const bad of ['sugar', { sugar: 1 }, null, undefined]) {
      assert.ok(run(bad).errors.nutrientPreferences);
    }
  });

  it('ignores extra fields on an entry', () => {
    const result = run([{ ...pref('sugar'), _id: 'x', user: 'y' }]);
    assert.deepEqual(result.value.nutrientPreferences, [{ nutrient: 'sugar', goal: 'lower', weight: 2 }]);
  });
});

describe('validatePreferences: predefined allergens', () => {
  const run = (allergens) => validatePreferences({ ...base, allergens });

  it('accepts all ten at once', () => {
    const result = run([...ALLERGEN_KEYS].reverse());
    assert.equal(result.valid, true);
    assert.deepEqual(result.value.allergens, ALLERGEN_KEYS);
  });

  it('rejects unknown, duplicate, non-string and non-list values', () => {
    for (const bad of [['mustard'], ['Milk'], ['milk', 'milk'], [1], [null], 'milk', null]) {
      assert.ok(run(bad).errors.allergens, JSON.stringify(bad));
    }
  });
});

describe('validatePreferences: custom ("Other") allergens', () => {
  it('accepts reasonable entries, including other languages', () => {
    const result = withCustom(['Mustard', 'Kiwi fruit', 'Ragi', "Children's malt-drink", 'मूंगफली']);
    assert.equal(result.valid, true);
    assert.equal(result.value.customAllergens.length, 5);
  });

  it('trims and collapses whitespace, keeping the typed casing', () => {
    assert.deepEqual(withCustom(['  Kiwi \t  fruit ']).value.customAllergens, ['Kiwi fruit']);
    assert.equal(normalizeCustomAllergen('  a   b '), 'a b');
  });

  it('enforces 3 to 40 characters', () => {
    assert.ok(withCustom(['ab']).errors['customAllergens.0']);
    assert.ok(withCustom(['   ']).errors['customAllergens.0']);
    assert.equal(withCustom(['abc']).valid, true);
    assert.equal(withCustom(['a'.repeat(40)]).valid, true);
    assert.ok(withCustom(['a'.repeat(41)]).errors['customAllergens.0']);
  });

  it('allows at most five entries', () => {
    assert.equal(withCustom(['One1', 'Two2', 'Three', 'Four4', 'Five5']).valid, true);
    assert.ok(withCustom(['One1', 'Two2', 'Three', 'Four4', 'Five5', 'Six66']).errors.customAllergens);
  });

  it('rejects duplicates, ignoring case and spacing, and points at the later entry', () => {
    const result = withCustom(['Mustard', 'mustard', 'MUSTARD ']);
    assert.equal(result.errors['customAllergens.0'], undefined);
    assert.ok(result.errors['customAllergens.1']);
    assert.ok(result.errors['customAllergens.2']);
    assert.equal(allergenKey('  Mus tard '), allergenKey('mus   TARD'));
  });

  it('rejects entries that repeat a predefined allergen and names it', () => {
    for (const same of ['Peanut', 'SHELLFISH', 'Sulfites', 'wheat', 'Soya', 'tree nuts', 'Milk', 'egg', 'Fish', 'sesame', 'groundnut', 'Wheat   gluten']) {
      const problem = customAllergenProblem(same);
      assert.match(problem ?? '', /already in the list above/, same);
    }
  });

  it('still allows narrower items than a predefined group', () => {
    assert.equal(withCustom(['Cashew', 'Almond', 'Prawn', 'Lactose']).valid, true);
  });

  it('rejects markup, emoji, control and zero-width characters, and odd punctuation', () => {
    const bad = ['<script>alert(1)</script>', '<b>x</b>', '🥜 nuts', 'mus\u200Btard', 'mus\u0000tard', '-mustard', "'mustard", 'a/b/c', 'mustard;drop', 'mus@tard', 'a\u202Eb'];
    for (const value of bad) {
      assert.ok(withCustom([value]).errors['customAllergens.0'], JSON.stringify(value));
    }
  });

  it('rejects non-string entries and non-lists', () => {
    for (const bad of [[5], [null], [{}], [['x']], [undefined]]) {
      assert.ok(withCustom(bad).errors['customAllergens.0'], JSON.stringify(bad));
    }
    for (const bad of ['mustard', { 0: 'mustard' }, null, undefined]) {
      assert.ok(withCustom(bad).errors.customAllergens);
    }
  });

  it('reports each bad entry separately by its position', () => {
    const result = withCustom(['Mustard', 'ab', '<b>x</b>']);
    assert.equal(result.errors['customAllergens.0'], undefined);
    assert.ok(result.errors['customAllergens.1']);
    assert.ok(result.errors['customAllergens.2']);
  });
});

describe('validateName (display-name editing)', () => {
  it('accepts 2 to 60 characters and normalises spaces', () => {
    const result = validateName({ name: '  Asha   Rao ' });
    assert.equal(result.valid, true);
    assert.equal(result.value.name, 'Asha Rao');
  });

  it('rejects too short, too long, empty and non-string names', () => {
    for (const bad of ['A', '', '   ', 'x'.repeat(61), 5, null, undefined, {}]) {
      assert.ok(validateName({ name: bad }).errors.name, String(bad));
    }
    assert.equal(validateName(undefined).valid, false);
  });
});
