import { DEFAULT_DIETARY_PREFERENCE } from '../config/nutrition.js';

/** The only profile fields that leave the server. Never exposes _id, user or __v. */
export function toPublicProfile(doc) {
  if (!doc) {
    return {
      dietaryPreference: DEFAULT_DIETARY_PREFERENCE,
      nutrientPreferences: [],
      allergens: [],
      customAllergens: [],
      isConfigured: false,
      updatedAt: null,
    };
  }
  return {
    dietaryPreference: doc.dietaryPreference ?? DEFAULT_DIETARY_PREFERENCE,
    nutrientPreferences: (doc.nutrientPreferences ?? []).map(({ nutrient, goal, weight }) => ({
      nutrient,
      goal,
      weight,
    })),
    allergens: [...(doc.allergens ?? [])],
    customAllergens: [...(doc.customAllergens ?? [])],
    isConfigured: true,
    updatedAt: doc.updatedAt ?? null,
  };
}
