import {
  ALLERGENS,
  ALLERGEN_KEYS,
  CUSTOM_ALLERGEN_LIMITS,
  CUSTOM_ALLERGEN_PATTERN,
  DIETARY_KEYS,
  GOALS,
  NUTRIENTS,
  NUTRIENT_KEYS,
  WEIGHT,
} from '../config/nutrition.js';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Trims and collapses inner whitespace. Stored in the casing the user typed. */
export function normalizeCustomAllergen(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
}

/** Case-insensitive comparison key. */
export function allergenKey(value) {
  return normalizeCustomAllergen(value).normalize('NFKC').toLowerCase();
}

const ALIAS_TO_LABEL = new Map();
for (const allergen of ALLERGENS) {
  for (const alias of [...allergen.aliases, allergen.key, allergen.label]) {
    ALIAS_TO_LABEL.set(allergenKey(alias), allergen.label);
  }
}

function validateNutrientPreferences(input, errors) {
  if (!Array.isArray(input)) {
    errors.nutrientPreferences = 'Nutrient preferences must be a list.';
    return [];
  }
  if (input.length > NUTRIENTS.length) {
    errors.nutrientPreferences = `Choose at most ${NUTRIENTS.length} nutrients.`;
    return [];
  }

  const chosen = new Map();
  for (const entry of input) {
    if (!isPlainObject(entry) || typeof entry.nutrient !== 'string' || !NUTRIENT_KEYS.includes(entry.nutrient)) {
      errors.nutrientPreferences = 'Each entry needs one of the listed nutrients.';
      continue;
    }
    const field = `nutrientPreferences.${entry.nutrient}`;
    if (chosen.has(entry.nutrient)) {
      errors[field] = 'Each nutrient can only be chosen once.';
      continue;
    }
    if (!GOALS.includes(entry.goal)) {
      errors[field] = 'Choose lower or higher.';
      continue;
    }
    if (typeof entry.weight !== 'number' || !Number.isInteger(entry.weight) || entry.weight < WEIGHT.min || entry.weight > WEIGHT.max) {
      errors[field] = `Weight must be a whole number from ${WEIGHT.min} to ${WEIGHT.max}.`;
      continue;
    }
    chosen.set(entry.nutrient, { nutrient: entry.nutrient, goal: entry.goal, weight: entry.weight });
  }
  // Canonical order keeps stored data and the UI stable.
  return NUTRIENT_KEYS.filter((key) => chosen.has(key)).map((key) => chosen.get(key));
}

function validateAllergens(input, errors) {
  if (!Array.isArray(input)) {
    errors.allergens = 'Allergens must be a list.';
    return [];
  }
  if (input.some((key) => typeof key !== 'string' || !ALLERGEN_KEYS.includes(key))) {
    errors.allergens = 'Each allergen must be one of the listed options.';
    return [];
  }
  if (new Set(input).size !== input.length) {
    errors.allergens = 'Each allergen can only be chosen once.';
    return [];
  }
  return ALLERGEN_KEYS.filter((key) => input.includes(key));
}

/** Returns an error message for one custom entry, or undefined if it is acceptable. */
export function customAllergenProblem(raw) {
  const { minLength, maxLength } = CUSTOM_ALLERGEN_LIMITS;
  if (typeof raw !== 'string') return 'Enter some text.';
  const value = normalizeCustomAllergen(raw);
  if (value.length < minLength) return `Use at least ${minLength} characters.`;
  if (value.length > maxLength) return `Use ${maxLength} characters or fewer.`;
  if (!CUSTOM_ALLERGEN_PATTERN.test(value)) {
    return 'Use letters, numbers, spaces, hyphens or apostrophes only.';
  }
  const predefined = ALIAS_TO_LABEL.get(allergenKey(value));
  if (predefined) return `“${predefined}” is already in the list above. Tick it there instead.`;
  return undefined;
}

function validateCustomAllergens(input, errors) {
  if (!Array.isArray(input)) {
    errors.customAllergens = 'Other allergens must be a list.';
    return [];
  }
  if (input.length > CUSTOM_ALLERGEN_LIMITS.maxEntries) {
    errors.customAllergens = `Add at most ${CUSTOM_ALLERGEN_LIMITS.maxEntries} other allergens.`;
    return [];
  }

  const seen = new Set();
  const cleaned = [];
  input.forEach((raw, index) => {
    const problem = customAllergenProblem(raw);
    if (problem) {
      errors[`customAllergens.${index}`] = problem;
      return;
    }
    const value = normalizeCustomAllergen(raw);
    const key = allergenKey(value);
    if (seen.has(key)) {
      errors[`customAllergens.${index}`] = 'You already added this one.';
      return;
    }
    seen.add(key);
    cleaned.push(value);
  });
  return cleaned;
}

/** Validates the whole preferences form. Unknown fields are ignored; every known field is required. */
export function validatePreferences(input) {
  const body = isPlainObject(input) ? input : {};
  const errors = {};

  if (typeof body.dietaryPreference !== 'string' || !DIETARY_KEYS.includes(body.dietaryPreference)) {
    errors.dietaryPreference = 'Choose one of the dietary options.';
  }
  const nutrientPreferences = validateNutrientPreferences(body.nutrientPreferences, errors);
  const allergens = validateAllergens(body.allergens, errors);
  const customAllergens = validateCustomAllergens(body.customAllergens, errors);

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { dietaryPreference: body.dietaryPreference, nutrientPreferences, allergens, customAllergens },
  };
}
