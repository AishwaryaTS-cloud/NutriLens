import { NUTRIENT_META } from '../nutrition/nutrients.js';

/**
 * The verified, already-calculated facts that explanations may talk about. Nothing here is
 * personal beyond the saved goals/diet/allergen choices (no name, email or image).
 */
export function buildExplanationFacts(analysis, profile) {
  const { label, nutrients, match } = analysis;
  const p = match.allergenPenalty;
  return {
    product: { name: label.productName, brand: label.brand, servingSize: label.servingSize.value ? `${label.servingSize.value} ${label.servingSize.unit}` : null, valuesAreFor: `per 100 ${label.per100Unit}` },
    nutrients: Object.values(nutrients).map((n) => ({ nutrient: n.label, value: n.value, unit: n.unit, level: n.level, lowLimit: n.low, mediumLimit: n.medium, usedInScore: n.scored })),
    energyKcalPer100: analysis.per100.energyKcal,
    userPreferences: {
      dietaryPreference: profile?.dietaryPreference ?? 'none',
      nutrientGoals: (profile?.nutrientPreferences ?? []).map((g) => ({ nutrient: NUTRIENT_META[g.nutrient]?.label ?? g.nutrient, goal: g.goal, importance: g.weight })),
      savedAllergens: [...(profile?.allergens ?? []), ...(profile?.customAllergens ?? [])],
    },
    scores: {
      status: match.status,
      personalPreferenceScore: match.components.preference.score,
      nutritionQualityScore: match.components.quality.score,
      ingredientScore: match.components.ingredient.score,
      weightsUsed: { preference: match.components.preference.weightUsed, quality: match.components.quality.weightUsed, ingredient: match.components.ingredient.weightUsed },
      baseScore: match.baseScore,
      totalAllergenPenalty: p.total,
      allergenPenaltyUncapped: p.uncappedTotal,
      penaltyCapApplied: p.capApplied,
      confirmedConflictScoreCeiling: p.ceiling,
      ceilingChangedTheScore: p.ceilingApplied,
      finalPersonalMatchScore: match.finalScore,
    },
    preferenceBreakdown: match.details.preference.items.map((i) => ({ nutrient: i.label, goal: i.goal, importance: i.weight, value: i.value, level: i.level, score: i.score })),
    ingredientFindings: match.details.ingredient.findings.map((f) => ({ type: f.type, points: f.points, message: f.message })),
    dietConflicts: match.details.ingredient.dietConflicts.map((c) => c.message),
    allergens: {
      informationStatus: match.allergens.status,
      statusReason: match.allergens.reason,
      matches: [...p.items.map((i) => ({ allergen: i.label, type: i.tier === 'confirmed' ? 'confirmed (declared or listed ingredient)' : 'possible cross-contamination (may contain)', penaltyPoints: i.points })), ],
      incompleteInformationPenaltyPoints: p.incompletePoints,
      possibleIngredientDerivedConcerns: match.allergens.possible.map((c) => c.label),
      detectedButNotInSavedAllergens: match.allergens.detected.filter((d) => !d.matchesUser && d.tier !== 'possible').map((d) => d.label),
    },
    limitations: match.limitations,
  };
}
