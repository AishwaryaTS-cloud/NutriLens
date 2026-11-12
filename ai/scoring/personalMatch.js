import { applyAllergenPenalty, computeAllergenPenalty } from './allergenPenalty.js';
import { COMPONENT_WEIGHTS, SCORING_VERSION } from './config.js';
import { computeIngredientScore } from '../ingredients/ingredientScore.js';
import { computePreferenceScore, computeQualityScore, round1, round2 } from './nutrientScores.js';
import { detectAllergens } from '../allergens/allergenDetector.js';

/**
 * Personal Match Score = preference x 0.50 + quality x 0.30 + ingredient x 0.20 (each 0-100),
 * minus allergen penalties (capped at 60), and at most 49 when a confirmed allergen conflict exists.
 *
 * When a component cannot be calculated (no nutrient goals chosen, no ingredient list) it is left
 * out and the remaining weights are scaled up proportionally; this is reported in `limitations`.
 * Nutrition Quality is required: without enough nutrition values no score is produced (null).
 */
export function computePersonalMatch({ label, per100, profile }) {
  const limitations = [];
  const preference = computePreferenceScore(per100, profile?.nutrientPreferences ?? []);
  const quality = computeQualityScore(per100);
  const ingredient = computeIngredientScore({ ingredientsText: label.ingredientsText, foodTypeMark: label.foodTypeMark, dietaryPreference: profile?.dietaryPreference ?? 'none' });
  const allergens = detectAllergens({ label, profile });
  const penalty = computeAllergenPenalty({ confirmed: allergens.confirmed, precautionary: allergens.precautionary, status: allergens.status, hasSavedAllergens: allergens.hasSavedAllergens });

  if (!preference.applicable) {
    limitations.push(preference.goalsSelected === 0 ? 'No nutrient goals are saved, so the Personal Preference Score was left out.' : 'None of your chosen nutrients have a value on this label, so the Personal Preference Score was left out.');
  } else if (preference.missing.length > 0) {
    limitations.push(`Some of your chosen nutrients are missing from this label and were left out (not treated as zero): ${preference.missing.join(', ')}.`);
  }
  if (!quality.applicable) limitations.push(`Only ${quality.items.length} of the 7 core nutrients have values; at least ${quality.minimumRequired} are needed, so no score was calculated.`);
  else if (quality.missing.length > 0) limitations.push(`Missing nutrients were left out of the Nutrition Quality Score (not treated as zero): ${quality.missing.join(', ')}.`);
  limitations.push(...ingredient.limitations);

  const parts = { preference: preference.score, quality: quality.score, ingredient: ingredient.score };
  const available = Object.keys(parts).filter((k) => parts[k] !== null);
  const weightSum = available.reduce((s, k) => s + COMPONENT_WEIGHTS[k], 0);
  const canScore = quality.applicable;
  const components = {};
  let base = 0;
  for (const key of Object.keys(parts)) {
    const weightUsed = canScore && parts[key] !== null ? COMPONENT_WEIGHTS[key] / weightSum : 0;
    const contribution = canScore && parts[key] !== null ? parts[key] * weightUsed : null;
    if (contribution !== null) base += contribution;
    components[key] = { score: parts[key], nominalWeight: COMPONENT_WEIGHTS[key], weightUsed: round2(weightUsed), contribution: contribution === null ? null : round2(contribution) };
  }
  const baseScore = canScore ? base : null;
  const { finalScore, ceilingApplied } = applyAllergenPenalty(baseScore, penalty);
  if (canScore && weightSum < 0.999) limitations.push(`Weights were scaled over the available components (${available.join(', ')}) so they still add up to 100%.`);
  if (allergens.status !== 'complete') limitations.push(`Allergen safety could not be established: ${allergens.reason}`);

  const status = !canScore ? 'insufficient_data' : limitations.length > 0 ? 'partial' : 'scored';
  return {
    version: SCORING_VERSION,
    status,
    baseScore: baseScore === null ? null : round1(baseScore),
    components,
    allergenPenalty: { ...penalty, ceilingApplied },
    finalScore,
    details: { preference, quality, ingredient },
    allergens,
    limitations,
  };
}
