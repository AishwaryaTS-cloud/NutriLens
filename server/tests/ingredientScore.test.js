import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INGREDIENT_RULES } from '../../ai/scoring/config.js';
import { computeIngredientScore } from '../../ai/ingredients/ingredientScore.js';
import { parseIngredientList, splitStatements, extractAdditiveCodes } from '../../ai/ingredients/ingredientParser.js';

const score = (ingredientsText, extra = {}) => computeIngredientScore({ ingredientsText, ...extra });

describe('ingredient parser', () => {
  it('flattens bracketed sub-ingredients and removes percentages', () => {
    const items = parseIngredientList('Ingredients: Wheat Flour (51%), Edible Vegetable Oil (Palm Oil, Rice Bran Oil), Emulsifier (322, 471), Salt');
    assert.deepEqual(items.map((i) => i.normalised), ['wheat flour', 'edible vegetable oil', 'palm oil', 'rice bran oil', 'emulsifier', '322', '471', 'salt']);
    assert.equal(items.find((i) => i.normalised === 'palm oil').nested, true);
  });
  it('finds INS / E additive codes', () => {
    assert.deepEqual(extractAdditiveCodes('Colour (INS 102), Emulsifier (322, 471), E211'), ['102', '211', '322', '471']);
  });
  it('splits inline allergen statements', () => {
    const r = splitStatements('Sugar, Wheat. Contains: Wheat, Soy. May contain traces of peanuts');
    assert.equal(r.ingredientsText, 'Sugar, Wheat');
    assert.equal(r.containsText, 'Wheat, Soy');
    assert.equal(r.mayContainText, 'peanuts');
  });
});

describe('Ingredient Score', () => {
  it('has a neutral base for a plain readable list', () => {
    const r = score('Rice flour, Salt');
    assert.equal(r.score, INGREDIENT_RULES.base);
    assert.deepEqual(r.findings, []);
  });
  it('is null (not zero) without a list', () => {
    for (const text of [null, '', '   ']) {
      const r = score(text);
      assert.equal(r.score, null);
      assert.equal(r.applicable, false);
    }
  });
  it('penalises sugar-type ingredients, more when listed first', () => {
    assert.equal(score('Wheat flour, Sugar').score, 70 - 8);
    assert.equal(score('Sugar, Wheat flour').score, 70 - 8 - 10);
    assert.equal(score('Sugar, Glucose syrup, Dextrose, Maltodextrin, Wheat').score, 70 - 30 + 0, 'sugar rules are capped at -30');
  });
  it('penalises hydrogenated fat and palm oil, capped', () => {
    assert.equal(score('Wheat, Hydrogenated vegetable fat').score, 70 - 15);
    assert.equal(score('Wheat, Palm oil').score, 70 - 8);
    assert.equal(score('Wheat, Vanaspati, Margarine, Shortening').score, 70 - 30);
  });
  it('penalises additives by kind (names and INS codes), once per kind', () => {
    assert.equal(score('Wheat, Colour (INS 102), Sodium benzoate, Aspartame').score, 70 - 15);
    assert.equal(score('Wheat, Tartrazine, Sunset yellow').score, 70 - 5);
    assert.equal(score('Wheat, Colour (INS 102), Sweetener (950), Preservative (211), Flavour enhancer (621), Artificial flavour').score, 70 - 20);
  });
  it('rewards whole foods, capped', () => {
    assert.equal(score('Whole wheat flour, Rolled oats').score, 70 + 12);
    assert.equal(score('Whole wheat flour, Rolled oats, Ragi, Jowar, Bajra, Quinoa').score, 70 + 24);
  });
  it('clamps between 0 and 100', () => {
    const worst = score('Sugar, Glucose syrup, Hydrogenated fat, Vanaspati, Colour (102), Aspartame, Sodium benzoate, MSG, Artificial flavour', { dietaryPreference: 'none' });
    assert.ok(worst.score >= 0 && worst.score <= 100);
    assert.ok(score('Whole wheat, Oats, Ragi, Jowar, Bajra, Millet, Almonds').score <= 100);
  });
  it('applies the dietary preference and lists the conflicts', () => {
    const vegan = score('Wheat flour, Milk solids, Honey', { dietaryPreference: 'vegan' });
    assert.equal(vegan.dietConflicts.length, 2);
    assert.ok(vegan.score < 70);
    assert.equal(score('Wheat flour, Milk solids', { dietaryPreference: 'vegetarian' }).dietConflicts.length, 0);
    assert.equal(score('Wheat flour, Gelatin', { dietaryPreference: 'vegetarian' }).dietConflicts.length, 1);
    assert.equal(score('Wheat flour, Egg powder', { dietaryPreference: 'eggetarian' }).dietConflicts.length, 0);
    assert.equal(score('Wheat flour, Egg powder', { dietaryPreference: 'vegetarian' }).dietConflicts.length, 0, 'eggs only conflict with vegan');
    assert.equal(score('Wheat, Tuna', { dietaryPreference: 'pescatarian' }).dietConflicts.length, 0);
    assert.equal(score('Wheat, Chicken', { dietaryPreference: 'pescatarian' }).dietConflicts.length, 1);
    assert.equal(score('Wheat, Milk solids', { dietaryPreference: 'none' }).dietConflicts.length, 0);
  });
  it('uses the non-veg mark for vegetarian and vegan users', () => {
    assert.equal(score('Wheat flour', { dietaryPreference: 'vegetarian', foodTypeMark: 'non_veg' }).dietConflicts.length, 1);
    assert.equal(score('Wheat flour', { dietaryPreference: 'eggetarian', foodTypeMark: 'non_veg' }).dietConflicts.length, 0);
  });
  it('does not treat coconut milk or cocoa butter as dairy', () => {
    assert.equal(score('Coconut milk, Cocoa butter', { dietaryPreference: 'vegan' }).dietConflicts.length, 0);
  });
  it('explains every finding', () => {
    for (const f of score('Sugar, Palm oil, Colour (INS 102), Rolled oats').findings) assert.ok(f.message.length > 10);
  });
});
