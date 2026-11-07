/**
 * Choices a user can make in their profile. The API sends these to the client (GET /api/profile),
 * so the lists live only here. Nutrients and weights follow the project synopsis.
 */

// The seven nutrients the synopsis classifies as LOW / MEDIUM / HIGH per 100 g.
export const NUTRIENTS = Object.freeze([
  { key: 'sugar', label: 'Sugar', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fibre', label: 'Fibre', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g' },
  { key: 'carbohydrates', label: 'Carbohydrates', unit: 'g' },
]);

export const GOALS = Object.freeze(['lower', 'higher']);

// "Weight = how important a nutrient is to the user": whole numbers 1 to 3 (3 matters most).
export const WEIGHT = Object.freeze({ min: 1, max: 3 });

export const DIETARY_PREFERENCES = Object.freeze([
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'eggetarian', label: 'Eggetarian' },
  { key: 'pescatarian', label: 'Pescatarian' },
  { key: 'none', label: 'No specific preference' },
]);
export const DEFAULT_DIETARY_PREFERENCE = 'none';

/**
 * Predefined allergens. `aliases` are other ways of writing the same thing; they are used only to
 * stop someone adding the same allergen again under "Other" (exact, case-insensitive matches).
 */
export const ALLERGENS = Object.freeze([
  { key: 'milk', label: 'Milk', aliases: ['milk'] },
  { key: 'eggs', label: 'Eggs', aliases: ['egg', 'eggs'] },
  { key: 'peanuts', label: 'Peanuts', aliases: ['peanut', 'peanuts', 'groundnut', 'groundnuts'] },
  { key: 'treeNuts', label: 'Tree nuts', aliases: ['tree nut', 'tree nuts', 'treenuts'] },
  { key: 'soy', label: 'Soy', aliases: ['soy', 'soya', 'soybean', 'soybeans', 'soya bean', 'soya beans'] },
  { key: 'gluten', label: 'Wheat / gluten', aliases: ['wheat', 'gluten', 'wheat gluten'] },
  { key: 'fish', label: 'Fish', aliases: ['fish'] },
  { key: 'crustaceans', label: 'Crustaceans / shellfish', aliases: ['crustacean', 'crustaceans', 'shellfish'] },
  { key: 'sesame', label: 'Sesame', aliases: ['sesame'] },
  { key: 'sulphites', label: 'Sulphites', aliases: ['sulphite', 'sulphites', 'sulfite', 'sulfites'] },
]);

// Free-text "Other" allergens.
export const CUSTOM_ALLERGEN_LIMITS = Object.freeze({ maxEntries: 5, minLength: 3, maxLength: 40 });
// Starts with a letter or digit; then letters (any language), combining marks, digits, spaces,
// hyphens and apostrophes. This rules out markup, control characters, zero-width characters, emoji.
export const CUSTOM_ALLERGEN_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} '’-]*$/u;

export const NUTRIENT_KEYS = NUTRIENTS.map((nutrient) => nutrient.key);
export const ALLERGEN_KEYS = ALLERGENS.map((allergen) => allergen.key);
export const DIETARY_KEYS = DIETARY_PREFERENCES.map((option) => option.key);

/** What GET /api/profile sends so the client never keeps its own copy of these lists. */
export const PROFILE_OPTIONS = Object.freeze({
  nutrients: NUTRIENTS,
  goals: GOALS,
  weights: WEIGHT,
  dietaryPreferences: DIETARY_PREFERENCES,
  allergens: ALLERGENS,
  customAllergens: CUSTOM_ALLERGEN_LIMITS,
});
