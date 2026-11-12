/**
 * Central scoring configuration. EVERY threshold, score and weight used by the Personal Match Score
 * lives here. All of them are project-defined heuristics (informed by selected claim criteria),
 * NOT official regulatory limits and NOT medical classifications.
 * All nutrient values are per 100 g (or per 100 ml); sodium in mg, everything else in g.
 */
export const SCORING_VERSION = '2.0.0';

/** Personal Match Score = preference x 0.50 + nutrition quality x 0.30 + ingredient x 0.20 (then allergen penalties). */
export const COMPONENT_WEIGHTS = Object.freeze({ preference: 0.5, quality: 0.3, ingredient: 0.2 });

/** value <= low -> LOW; value <= medium -> MEDIUM; otherwise HIGH. */
export const NUTRIENT_THRESHOLDS = Object.freeze({
  sugar: Object.freeze({ low: 5, medium: 12.5, unit: 'g' }),
  protein: Object.freeze({ low: 5, medium: 12, unit: 'g' }),
  fibre: Object.freeze({ low: 1.5, medium: 3, unit: 'g' }),
  sodium: Object.freeze({ low: 120, medium: 600, unit: 'mg' }),
  fat: Object.freeze({ low: 3, medium: 17.5, unit: 'g' }),
  saturatedFat: Object.freeze({ low: 1.5, medium: 5, unit: 'g' }),
  carbohydrates: Object.freeze({ low: 10, medium: 30, unit: 'g' }),
});

/** Information-only nutrients: classified for display but NOT part of any score. Added sugar reuses the sugar limits. */
export const INFO_THRESHOLDS = Object.freeze({
  addedSugar: Object.freeze({ low: 5, medium: 12.5, unit: 'g', note: 'Uses the same limits as total sugar.' }),
});

export const LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

/** Score given to a nutrient class, depending on whether the user wants that nutrient lower or higher. */
export const GOAL_SCORES = Object.freeze({
  lower: Object.freeze({ LOW: 100, MEDIUM: 50, HIGH: 10 }),
  higher: Object.freeze({ LOW: 20, MEDIUM: 60, HIGH: 100 }),
});

/**
 * Nutrition Quality Score: each nutrient has a fixed direction ("lower is better" or "higher is
 * better") and an importance weight. Uses the same class -> score table as personal goals.
 */
export const QUALITY_RULES = Object.freeze({
  sugar: Object.freeze({ direction: 'lower', weight: 3 }),
  sodium: Object.freeze({ direction: 'lower', weight: 2 }),
  saturatedFat: Object.freeze({ direction: 'lower', weight: 2 }),
  fat: Object.freeze({ direction: 'lower', weight: 1 }),
  carbohydrates: Object.freeze({ direction: 'lower', weight: 1 }),
  protein: Object.freeze({ direction: 'higher', weight: 2 }),
  fibre: Object.freeze({ direction: 'higher', weight: 2 }),
});

/** At least this many of the 7 core nutrients must be present (per 100 g) before any score is produced. */
export const MIN_CORE_NUTRIENTS = 4;

export const INGREDIENT_RULES = Object.freeze({
  base: 70, // neutral reference for a readable ingredient list
  sugarTypeEach: -8,
  sugarFirstIngredient: -10,
  sugarCap: -30,
  harmfulFatEach: -15, // hydrogenated / vanaspati / margarine / shortening
  palmEach: -8,
  fatCap: -30,
  additiveEach: -5, // artificial colour, sweetener, preservative, flavour enhancer
  additiveCap: -20,
  wholeFoodEach: 6,
  wholeFoodCap: 24,
  dietConflict: -40,
});

export const ALLERGEN_PENALTY = Object.freeze({
  confirmed: 40, // per distinct confirmed allergen matching the user's saved allergens
  precautionary: 15, // per distinct "may contain" allergen matching the user's saved allergens
  incomplete: 10, // once, when allergen information is unavailable / incomplete
  cap: 60,
  confirmedScoreCeiling: 49,
});
