const LEVEL_WORD = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/**
 * Plain, deterministic explanations built only from the calculated results. Used whenever Gemini
 * is unavailable, out of quota, or returns something that cannot be verified.
 */
export function buildRuleBasedExplanation(analysis, profile) {
  const { label, nutrients, match } = analysis;
  const p = match.allergenPenalty;
  const name = label.productName ? `“${label.productName}”` : 'This product';
  const unit = `per 100 ${label.per100Unit}`;

  const levels = Object.values(nutrients).filter((n) => n.value !== null).map((n) => ({
    nutrient: n.label,
    text: `${n.label} is ${fmt(n.value)} ${n.unit} ${unit}, which is ${LEVEL_WORD[n.level]} (low is up to ${n.low} ${n.unit}, medium up to ${n.medium} ${n.unit}).${n.scored ? '' : ' This is shown for information and is not part of the score.'}`,
  }));
  const high = Object.values(nutrients).filter((n) => n.level === 'HIGH' && n.scored);
  const advantages = [];
  const disadvantages = [];
  for (const item of match.details.quality.items) {
    if (item.direction === 'lower' && item.level === 'LOW') advantages.push(`Low ${item.label.toLowerCase()} (${fmt(item.value)} ${item.unit} ${unit}).`);
    if (item.direction === 'lower' && item.level === 'HIGH') disadvantages.push(`High ${item.label.toLowerCase()} (${fmt(item.value)} ${item.unit} ${unit}).`);
    if (item.direction === 'higher' && item.level === 'HIGH') advantages.push(`High ${item.label.toLowerCase()} (${fmt(item.value)} ${item.unit} ${unit}).`);
    if (item.direction === 'higher' && item.level === 'LOW') disadvantages.push(`Low ${item.label.toLowerCase()} (${fmt(item.value)} ${item.unit} ${unit}).`);
  }
  for (const f of match.details.ingredient.findings) (f.points > 0 ? advantages : disadvantages).push(f.message);

  const allergenWarnings = [];
  for (const item of p.items) {
    allergenWarnings.push(item.tier === 'confirmed'
      ? `${item.label}: confirmed on the label (declared or listed as an ingredient). This matches your saved allergens, so ${item.points} points were deducted.`
      : `${item.label}: the label says it MAY contain this (possible cross-contamination). This matches your saved allergens, so ${item.points} points were deducted.`);
  }
  for (const c of match.allergens.possible) allergenWarnings.push(`${c.label}: an ingredient may be derived from it (the source is not stated). This is a possible concern and no points were deducted. Check with the manufacturer.`);
  if (match.allergens.status !== 'complete') allergenWarnings.push(`Allergen safety could not be established: ${match.allergens.reason}${p.incompletePoints ? ` ${p.incompletePoints} points were deducted.` : ''}`);
  if (allergenWarnings.length === 0) allergenWarnings.push('No allergen matching your saved allergens was found in the information provided.');

  let scoreText;
  if (match.finalScore === null) {
    scoreText = 'A Personal Match Score could not be calculated because too few nutrition values are available.';
  } else {
    const c = match.components;
    const parts = [
      c.preference.score !== null ? `Personal Preference ${fmt(c.preference.score)} × ${fmt(c.preference.weightUsed)}` : null,
      `Nutrition Quality ${fmt(c.quality.score)} × ${fmt(c.quality.weightUsed)}`,
      c.ingredient.score !== null ? `Ingredient ${fmt(c.ingredient.score)} × ${fmt(c.ingredient.weightUsed)}` : null,
    ].filter(Boolean).join(' + ');
    scoreText = `The base score is ${fmt(match.baseScore)} (${parts}). ${p.total > 0 ? `Allergen penalties of ${p.total} points were then subtracted${p.capApplied ? ` (capped from ${p.uncappedTotal})` : ''}. ` : ''}${p.ceilingApplied ? `Because a confirmed allergen conflict exists, the score cannot be above ${p.ceiling}. ` : ''}The final Personal Match Score is ${match.finalScore} out of 100. This is a guide based on your saved preferences, not medical advice.`;
  }

  const suggestions = [];
  if (p.hasConfirmedConflict) suggestions.push('Avoid this product unless you have checked the label yourself: it conflicts with your saved allergens.');
  if (high.some((n) => n.nutrient === 'sugar')) suggestions.push('Look for a similar product with lower sugar.');
  if (high.some((n) => n.nutrient === 'sodium')) suggestions.push('Look for a similar product with lower sodium.');
  if (match.limitations.length > 0) suggestions.push('Correct or add missing label details to get a more complete result.');
  if (suggestions.length === 0) suggestions.push('Compare it with similar products using the compare page.');

  const ingredient = match.details.ingredient;
  return {
    overview: `${name}${label.brand ? ` by ${label.brand}` : ''}${match.finalScore === null ? ' has too little data for a Personal Match Score.' : ` has a Personal Match Score of ${match.finalScore} out of 100.`}${match.status === 'partial' ? ' Some information was missing, so treat this result with care.' : ''}`,
    nutritionExplanation: levels.length ? `All amounts are ${unit}: ${Object.values(nutrients).filter((n) => n.value !== null).map((n) => `${n.label} ${fmt(n.value)} ${n.unit} (${LEVEL_WORD[n.level]})`).join(', ')}. Levels use project-defined limits, not medical classifications.` : 'No nutrition values were available.',
    nutrientLevels: levels,
    ingredientExplanation: ingredient.applicable ? `The ingredient score is ${fmt(ingredient.score)} out of 100, starting from a neutral ${ingredient.base}.${ingredient.findings.length ? ' ' + ingredient.findings.map((f) => f.message).join(' ') : ' No scoring rule applied to this list.'}` : 'There is no ingredient list, so ingredients were not scored.',
    allergenWarnings,
    personalMatchExplanation: scoreText,
    advantages: advantages.slice(0, 8),
    disadvantages: disadvantages.slice(0, 8),
    suggestions: suggestions.slice(0, 6),
    cautions: match.limitations.slice(0, 8),
  };
}
