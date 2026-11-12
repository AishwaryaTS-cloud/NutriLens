/**
 * Canonical nutrient list used by extraction, validation and scoring.
 * Canonical units: energy in kcal, sodium in mg, everything else in g.
 */
export const LABEL_NUTRIENTS = Object.freeze([
  'energyKcal',
  'sugar',
  'addedSugar',
  'protein',
  'fat',
  'saturatedFat',
  'transFat',
  'carbohydrates',
  'fibre',
  'sodium',
]);

// The seven nutrients that are classified LOW / MEDIUM / HIGH and scored.
export const CORE_NUTRIENTS = Object.freeze(['sugar', 'protein', 'fibre', 'sodium', 'fat', 'saturatedFat', 'carbohydrates']);

export const NUTRIENT_META = Object.freeze({
  energyKcal: { label: 'Energy', unit: 'kcal' },
  sugar: { label: 'Total sugar', unit: 'g' },
  addedSugar: { label: 'Added sugar', unit: 'g' },
  protein: { label: 'Protein', unit: 'g' },
  fat: { label: 'Total fat', unit: 'g' },
  saturatedFat: { label: 'Saturated fat', unit: 'g' },
  transFat: { label: 'Trans fat', unit: 'g' },
  carbohydrates: { label: 'Carbohydrates', unit: 'g' },
  fibre: { label: 'Dietary fibre', unit: 'g' },
  sodium: { label: 'Sodium', unit: 'mg' },
});

export const SERVING_UNITS = Object.freeze(['g', 'ml']);
export const FOOD_TYPE_MARKS = Object.freeze(['veg', 'non_veg', 'vegan']);

/** Plausibility limits (physical limits, not health thresholds). */
export const VALIDATION_LIMITS = Object.freeze({
  maxGramsPer100: 100,
  maxSodiumMgPer100: 40000, // pure salt is about 39,300 mg sodium per 100 g
  maxEnergyKcalPer100: 910, // pure fat is about 900 kcal per 100 g
  maxServingSize: 2000,
  roundingToleranceG: 0.5, // labels round to 0.1-0.5 g
  columnMismatch: { relative: 0.25, absolute: { g: 1, mg: 10, kcal: 10 } },
  energyMismatch: { relative: 0.25, absolute: 40 }, // plausibility only (warning)
  sodiumPerGramSaltMg: 400, // sodium = salt / 2.5
});

export const TEXT_LIMITS = Object.freeze({ name: 120, ingredients: 4000, allergenEntries: 20, allergenEntryLength: 60 });
