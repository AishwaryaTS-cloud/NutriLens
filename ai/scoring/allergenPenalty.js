import { ALLERGEN_PENALTY } from './config.js';

/**
 * Allergen penalty rules (pure):
 *  - 40 per distinct confirmed allergen matching the user's saved allergens
 *  - 15 per distinct precautionary ("may contain") allergen matching them (never also counted as confirmed)
 *  - 10 once if allergen information is unavailable/incomplete (only when the user saved allergens)
 *  - total capped at 60; final = max(0, base - total); any confirmed conflict caps the final score at 49
 * `confirmed` / `precautionary` are arrays of { id, label }.
 */
export function computeAllergenPenalty({ confirmed = [], precautionary = [], status = 'complete', hasSavedAllergens = true }) {
  const confirmedIds = new Set();
  const confirmedItems = [];
  for (const item of confirmed) {
    if (confirmedIds.has(item.id)) continue;
    confirmedIds.add(item.id);
    confirmedItems.push({ id: item.id, label: item.label, tier: 'confirmed', points: ALLERGEN_PENALTY.confirmed });
  }
  const seen = new Set();
  const precautionaryItems = [];
  for (const item of precautionary) {
    if (confirmedIds.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    precautionaryItems.push({ id: item.id, label: item.label, tier: 'precautionary', points: ALLERGEN_PENALTY.precautionary });
  }
  const incompletePoints = hasSavedAllergens && status !== 'complete' ? ALLERGEN_PENALTY.incomplete : 0;
  const raw = confirmedItems.length * ALLERGEN_PENALTY.confirmed + precautionaryItems.length * ALLERGEN_PENALTY.precautionary + incompletePoints;
  const total = Math.min(raw, ALLERGEN_PENALTY.cap);
  return {
    items: [...confirmedItems, ...precautionaryItems],
    incompletePoints,
    uncappedTotal: raw,
    total,
    capApplied: raw > ALLERGEN_PENALTY.cap,
    hasConfirmedConflict: confirmedItems.length > 0,
    ceiling: confirmedItems.length > 0 ? ALLERGEN_PENALTY.confirmedScoreCeiling : null,
  };
}

/** Final = max(0, base - penalty), then at most 49 when a confirmed conflict exists. Returns null if base is null. */
export function applyAllergenPenalty(baseScore, penalty) {
  if (baseScore === null || baseScore === undefined) return { finalScore: null, ceilingApplied: false };
  let final = Math.max(0, baseScore - penalty.total);
  let ceilingApplied = false;
  if (penalty.hasConfirmedConflict) {
    const rounded = Math.round(final);
    if (rounded > ALLERGEN_PENALTY.confirmedScoreCeiling) ceilingApplied = true;
    final = Math.min(rounded, ALLERGEN_PENALTY.confirmedScoreCeiling);
  }
  return { finalScore: Math.min(100, Math.max(0, Math.round(final))), ceilingApplied };
}
