/**
 * Pure helpers for the preferences form: state conversion, payload building and validation.
 * They mirror the server's rules for fast feedback; the server stays authoritative.
 * `options` is the object GET /api/profile returns (nutrients, allergens, weights, limits).
 */

const CUSTOM_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} '’-]*$/u;

export const hasErrors = (errors) => Object.keys(errors).length > 0;

export function normalizeCustomAllergen(text) {
  return typeof text === 'string' ? text.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
}

export function allergenKey(text) {
  return normalizeCustomAllergen(text).normalize('NFKC').toLowerCase();
}

function aliasLabel(options, key) {
  for (const allergen of options.allergens) {
    for (const alias of [...allergen.aliases, allergen.key, allergen.label]) {
      if (allergenKey(alias) === key) return allergen.label;
    }
  }
  return undefined;
}

/** A message if `text` cannot be added as a custom allergen, otherwise undefined. */
export function customAllergenProblem(text, options, existing = []) {
  const { minLength, maxLength, maxEntries } = options.customAllergens;
  const value = normalizeCustomAllergen(text);
  if (existing.length >= maxEntries) return `You can add up to ${maxEntries} other allergens.`;
  if (value.length < minLength) return `Use at least ${minLength} characters.`;
  if (value.length > maxLength) return `Use ${maxLength} characters or fewer.`;
  if (!CUSTOM_PATTERN.test(value)) return 'Use letters, numbers, spaces, hyphens or apostrophes only.';
  const predefined = aliasLabel(options, allergenKey(value));
  if (predefined) return `“${predefined}” is already in the list above. Tick it there instead.`;
  if (existing.some((entry) => allergenKey(entry) === allergenKey(value))) return 'You already added this one.';
  return undefined;
}

export function toFormState(profile, options) {
  const nutrients = {};
  for (const nutrient of options.nutrients) {
    const saved = profile.nutrientPreferences.find((item) => item.nutrient === nutrient.key);
    // Nothing is pre-selected: a goal and weight exist only if the user chose them.
    nutrients[nutrient.key] = saved
      ? { selected: true, goal: saved.goal, weight: saved.weight }
      : { selected: false, goal: null, weight: null };
  }
  return {
    dietaryPreference: profile.dietaryPreference,
    nutrients,
    allergens: [...profile.allergens],
    otherOpen: profile.customAllergens.length > 0,
    customAllergens: [...profile.customAllergens],
    customDraft: '',
  };
}

export function toPayload(form, options) {
  return {
    dietaryPreference: form.dietaryPreference,
    nutrientPreferences: options.nutrients
      .filter((nutrient) => form.nutrients[nutrient.key].selected)
      .map((nutrient) => ({
        nutrient: nutrient.key,
        goal: form.nutrients[nutrient.key].goal,
        weight: form.nutrients[nutrient.key].weight,
      })),
    allergens: options.allergens.filter((a) => form.allergens.includes(a.key)).map((a) => a.key),
    customAllergens: form.otherOpen ? form.customAllergens.map(normalizeCustomAllergen) : [],
  };
}

/** Error keys match the server's: nutrientPreferences.<nutrient>, customAllergens.<index>, customDraft. */
export function validatePreferencesForm(form, options) {
  const errors = {};

  for (const nutrient of options.nutrients) {
    const state = form.nutrients[nutrient.key];
    if (!state.selected) continue;
    if (!state.goal) errors[`nutrientPreferences.${nutrient.key}`] = 'Choose lower or higher.';
    else if (!state.weight) {
      errors[`nutrientPreferences.${nutrient.key}`] = `Choose a weight from ${options.weights.min} to ${options.weights.max}.`;
    }
  }

  if (form.otherOpen) {
    if (normalizeCustomAllergen(form.customDraft)) {
      errors.customDraft = 'Press Add to include this allergen, or clear the box.';
    }
    form.customAllergens.forEach((entry, index) => {
      const problem = customAllergenProblem(entry, options, form.customAllergens.slice(0, index));
      if (problem) errors[`customAllergens.${index}`] = problem;
    });
  }
  return errors;
}

export function toggleAllergen(form, key) {
  const allergens = form.allergens.includes(key) ? form.allergens.filter((k) => k !== key) : [...form.allergens, key];
  return { ...form, allergens };
}

/** Unticking "Other" removes the custom entries, because they are hidden with it. */
export function setOtherOpen(form, open) {
  return open ? { ...form, otherOpen: true } : { ...form, otherOpen: false, customAllergens: [], customDraft: '' };
}

export function setNutrientSelected(form, key, selected) {
  const state = selected ? { ...form.nutrients[key], selected: true } : { selected: false, goal: null, weight: null };
  return { ...form, nutrients: { ...form.nutrients, [key]: state } };
}

export function setNutrientField(form, key, field, value) {
  return { ...form, nutrients: { ...form.nutrients, [key]: { ...form.nutrients[key], [field]: value } } };
}

/** Adds the typed draft to the list, or returns the reason it cannot be added. */
export function addCustomAllergen(form, options) {
  const problem = customAllergenProblem(form.customDraft, options, form.customAllergens);
  if (problem) return { form, error: problem };
  return {
    form: { ...form, customAllergens: [...form.customAllergens, normalizeCustomAllergen(form.customDraft)], customDraft: '' },
    error: undefined,
  };
}

export function removeCustomAllergen(form, index) {
  return { ...form, customAllergens: form.customAllergens.filter((_, i) => i !== index) };
}

export function validateNameValue(name) {
  const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  return clean.length < 2 || clean.length > 60 ? 'Enter your name (2 to 60 characters).' : undefined;
}

/** Plain-language summary for the dashboard. */
export function summarizeProfile(profile, options) {
  const labelOf = (list, key) => list.find((item) => item.key === key)?.label ?? key;
  return {
    isConfigured: profile.isConfigured,
    dietary: labelOf(options.dietaryPreferences, profile.dietaryPreference),
    nutrients: profile.nutrientPreferences.map((item) => ({
      key: item.nutrient,
      label: labelOf(options.nutrients, item.nutrient),
      goal: item.goal === 'lower' ? 'Lower is better' : 'Higher is better',
      weight: item.weight,
    })),
    allergens: [...profile.allergens.map((key) => labelOf(options.allergens, key)), ...profile.customAllergens],
  };
}
