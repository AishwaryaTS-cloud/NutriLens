import { emptyLabel } from '../../ai/nutrition/labelValidator.js';

/** A canonical label with per-100 g values and optional overrides. */
export function labelWith(per100 = {}, overrides = {}) {
  const label = emptyLabel();
  Object.assign(label.per100g, per100);
  return { ...label, ingredientsText: 'Rolled oats, Rice flour, Salt', allergenInfo: { contains: [], mayContain: [], complete: true }, ...overrides };
}

export const GOOD_NUTRIENTS = { sugar: 3, protein: 15, fibre: 5, sodium: 100, fat: 2, saturatedFat: 1, carbohydrates: 20 };

export const profileWith = (overrides = {}) => ({ dietaryPreference: 'none', nutrientPreferences: [], allergens: [], customAllergens: [], ...overrides });
