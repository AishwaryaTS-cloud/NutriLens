import { CORE_NUTRIENTS, NUTRIENT_META } from '../nutrition/nutrients.js';
import { GOAL_SCORES, INFO_THRESHOLDS, MIN_CORE_NUTRIENTS, NUTRIENT_THRESHOLDS, QUALITY_RULES } from './config.js';

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/** LOW if value <= low limit, MEDIUM if <= medium limit, otherwise HIGH. Missing value -> null (never LOW). */
export function classifyValue(limits, value) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  if (value <= limits.low) return 'LOW';
  if (value <= limits.medium) return 'MEDIUM';
  return 'HIGH';
}

export function classifyNutrient(nutrient, value) {
  const limits = NUTRIENT_THRESHOLDS[nutrient] ?? INFO_THRESHOLDS[nutrient];
  return limits ? classifyValue(limits, value) : null;
}

/** Score for one nutrient: class + goal ("lower" | "higher") -> 0-100. */
export function nutrientScore(nutrient, value, goal) {
  const level = classifyNutrient(nutrient, value);
  if (!level || !GOAL_SCORES[goal]) return null;
  return GOAL_SCORES[goal][level];
}

/** Classification of every nutrient (core + information-only) for display. */
export function classifyAll(per100) {
  const rows = {};
  for (const key of [...CORE_NUTRIENTS, 'addedSugar']) {
    const limits = NUTRIENT_THRESHOLDS[key] ?? INFO_THRESHOLDS[key];
    const value = per100[key] ?? null;
    rows[key] = { nutrient: key, label: NUTRIENT_META[key].label, unit: NUTRIENT_META[key].unit, value, level: classifyValue(limits, value), low: limits.low, medium: limits.medium, scored: key !== 'addedSugar' };
  }
  return rows;
}

/**
 * Personal Preference Score (0-100): weighted average of the nutrient scores for the nutrients the
 * user chose. P = sum(score x weight) / sum(weight). Nutrients with no value are left out (never zero).
 */
export function computePreferenceScore(per100, nutrientPreferences = []) {
  const items = [];
  const missing = [];
  for (const pref of nutrientPreferences) {
    if (!NUTRIENT_THRESHOLDS[pref.nutrient]) continue;
    const value = per100[pref.nutrient] ?? null;
    const level = classifyNutrient(pref.nutrient, value);
    if (!level) {
      missing.push(pref.nutrient);
      continue;
    }
    const score = GOAL_SCORES[pref.goal][level];
    const limits = NUTRIENT_THRESHOLDS[pref.nutrient];
    items.push({ nutrient: pref.nutrient, label: NUTRIENT_META[pref.nutrient].label, unit: limits.unit, goal: pref.goal, weight: pref.weight, value, level, low: limits.low, medium: limits.medium, score, points: score * pref.weight });
  }
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  const score = totalWeight > 0 ? round2(items.reduce((sum, i) => sum + i.points, 0) / totalWeight) : null;
  return { applicable: score !== null, score, totalWeight, items, missing, goalsSelected: nutrientPreferences.length };
}

/**
 * Nutrition Quality Score (0-100): fixed direction per nutrient (lower is better for sugar, sodium,
 * fat, saturated fat, carbohydrates; higher is better for protein and fibre) with importance weights.
 * Needs at least MIN_CORE_NUTRIENTS present values; otherwise the score is null.
 */
export function computeQualityScore(per100) {
  const items = [];
  const missing = [];
  for (const nutrient of CORE_NUTRIENTS) {
    const value = per100[nutrient] ?? null;
    const level = classifyNutrient(nutrient, value);
    if (!level) {
      missing.push(nutrient);
      continue;
    }
    const { direction, weight } = QUALITY_RULES[nutrient];
    const score = GOAL_SCORES[direction][level];
    const limits = NUTRIENT_THRESHOLDS[nutrient];
    items.push({ nutrient, label: NUTRIENT_META[nutrient].label, unit: limits.unit, direction, weight, value, level, low: limits.low, medium: limits.medium, score, points: score * weight });
  }
  const enough = items.length >= MIN_CORE_NUTRIENTS;
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  const score = enough ? round2(items.reduce((sum, i) => sum + i.points, 0) / totalWeight) : null;
  return { applicable: enough, score, totalWeight, items, missing, minimumRequired: MIN_CORE_NUTRIENTS };
}

export { round1, round2 };
