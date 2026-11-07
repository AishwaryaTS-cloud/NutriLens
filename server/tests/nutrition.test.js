import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALLERGENS,
  CUSTOM_ALLERGEN_LIMITS,
  DIETARY_PREFERENCES,
  GOALS,
  NUTRIENTS,
  PROFILE_OPTIONS,
  WEIGHT,
} from '../config/nutrition.js';

describe('profile choices (config/nutrition.js)', () => {
  it('has exactly the seven synopsis nutrients, in order, with units', () => {
    assert.deepEqual(
      NUTRIENTS.map((n) => n.key),
      ['sugar', 'protein', 'fibre', 'sodium', 'fat', 'saturatedFat', 'carbohydrates'],
    );
    assert.equal(NUTRIENTS.find((n) => n.key === 'sodium').unit, 'mg');
    assert.equal(NUTRIENTS.filter((n) => n.unit === 'g').length, 6);
  });

  it('offers the five agreed dietary preferences', () => {
    assert.deepEqual(
      DIETARY_PREFERENCES.map((d) => [d.key, d.label]),
      [
        ['vegetarian', 'Vegetarian'],
        ['vegan', 'Vegan'],
        ['eggetarian', 'Eggetarian'],
        ['pescatarian', 'Pescatarian'],
        ['none', 'No specific preference'],
      ],
    );
  });

  it('offers the ten agreed predefined allergens', () => {
    assert.deepEqual(
      ALLERGENS.map((a) => [a.key, a.label]),
      [
        ['milk', 'Milk'],
        ['eggs', 'Eggs'],
        ['peanuts', 'Peanuts'],
        ['treeNuts', 'Tree nuts'],
        ['soy', 'Soy'],
        ['gluten', 'Wheat / gluten'],
        ['fish', 'Fish'],
        ['crustaceans', 'Crustaceans / shellfish'],
        ['sesame', 'Sesame'],
        ['sulphites', 'Sulphites'],
      ],
    );
  });

  it('keeps allergen aliases lowercase, tidy and unique across allergens', () => {
    const seen = new Set();
    for (const allergen of ALLERGENS) {
      for (const alias of allergen.aliases) {
        assert.equal(alias, alias.trim().replace(/\s+/g, ' ').toLowerCase());
        assert.equal(seen.has(alias), false, `alias "${alias}" appears twice`);
        seen.add(alias);
      }
    }
  });

  it('uses whole-number weights 1 to 3, lower/higher goals and the agreed custom limits', () => {
    assert.deepEqual({ ...WEIGHT }, { min: 1, max: 3 });
    assert.deepEqual([...GOALS], ['lower', 'higher']);
    assert.deepEqual({ ...CUSTOM_ALLERGEN_LIMITS }, { maxEntries: 5, minLength: 3, maxLength: 40 });
  });

  it('sends every list to the client in PROFILE_OPTIONS', () => {
    assert.equal(PROFILE_OPTIONS.nutrients.length, 7);
    assert.equal(PROFILE_OPTIONS.allergens.length, 10);
    assert.equal(PROFILE_OPTIONS.dietaryPreferences.length, 5);
    assert.equal(PROFILE_OPTIONS.weights.max, 3);
    assert.equal(PROFILE_OPTIONS.customAllergens.maxEntries, 5);
  });
});
