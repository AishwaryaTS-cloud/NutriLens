import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toPublicProfile } from '../utils/publicProfile.js';

describe('toPublicProfile', () => {
  it('describes a user who has not saved anything yet', () => {
    assert.deepEqual(toPublicProfile(null), {
      dietaryPreference: 'none',
      nutrientPreferences: [],
      allergens: [],
      customAllergens: [],
      isConfigured: false,
      updatedAt: null,
    });
  });

  it('exposes only the public fields (no _id, user or __v)', () => {
    const updatedAt = new Date('2026-11-07T10:00:00Z');
    const result = toPublicProfile({
      _id: 'abc',
      user: 'someone',
      __v: 0,
      dietaryPreference: 'vegan',
      nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 2, _id: 'x', extra: 1 }],
      allergens: ['milk'],
      customAllergens: ['Mustard'],
      updatedAt,
    });
    assert.deepEqual(result, {
      dietaryPreference: 'vegan',
      nutrientPreferences: [{ nutrient: 'sugar', goal: 'lower', weight: 2 }],
      allergens: ['milk'],
      customAllergens: ['Mustard'],
      isConfigured: true,
      updatedAt,
    });
  });

  it('copies arrays so callers cannot change the stored document', () => {
    const doc = { dietaryPreference: 'none', nutrientPreferences: [], allergens: ['milk'], customAllergens: [] };
    toPublicProfile(doc).allergens.push('fish');
    assert.deepEqual(doc.allergens, ['milk']);
  });
});
