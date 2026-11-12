import { ALLERGENS } from '../../server/config/nutrition.js';
import { containsKeyword, extractAdditiveCodes, normaliseText, parseIngredientList, splitStatements } from '../ingredients/ingredientParser.js';
import { ALLERGEN_KEYWORDS, SULPHITE_CODES } from './allergenData.js';

const LABELS = Object.fromEntries(ALLERGENS.map((a) => [a.key, a.label]));
// Phrases that contain an allergen word but are not that allergen.
const EXCLUSIONS = ['coconut milk', 'coconut cream', 'cocoa butter', 'shea butter', 'cream of tartar', 'nutmeg', 'butter bean', 'butterfly pea', 'almond oil free'];
const RANK = { possible: 1, precautionary: 2, confirmed: 3 };

function strip(text) {
  let out = normaliseText(text);
  for (const phrase of EXCLUSIONS) out = out.split(phrase).join(' ');
  return out;
}

const splitEntries = (text) => String(text ?? '').split(/,|;|\band\b|&|\//i).map((s) => s.trim()).filter(Boolean);

/** Map one printed allergen name (e.g. "Soya", "tree nuts") to predefined allergen keys. */
export function mapNameToKeys(name) {
  const text = strip(name);
  return Object.entries(ALLERGEN_KEYWORDS)
    .filter(([, { definite }]) => definite.some((word) => containsKeyword(text, word)))
    .map(([key]) => key);
}

export const customKey = (value) => `custom:${normaliseText(value)}`;

/**
 * Detects allergens in a validated label.
 *  confirmed     = named in a "Contains" declaration or listed as an ingredient
 *  precautionary = named in a "May contain / traces of" statement
 *  possible      = an ingredient that MAY come from an allergen (e.g. lecithin) - reported, never penalised
 * Does NOT calculate penalties (see ai/scoring/allergenPenalty.js).
 */
export function detectAllergens({ label, profile }) {
  const info = label.allergenInfo ?? {};
  const inline = splitStatements(label.ingredientsText ?? '');
  const ingredientsText = inline.ingredientsText;
  const found = new Map(); // id -> { id, key, label, tier, sources: Set }

  const customs = (profile?.customAllergens ?? []).map((value) => ({ value, id: customKey(value), words: normaliseText(value) }));
  const record = (id, name, tier, source) => {
    const entry = found.get(id) ?? { id, key: id.startsWith('custom:') ? null : id, label: name, tier: 'possible', sources: new Set() };
    if (RANK[tier] > RANK[entry.tier]) entry.tier = tier;
    entry.sources.add(source);
    found.set(id, entry);
  };
  const recordText = (text, tier, source) => {
    const stripped = strip(text);
    for (const key of mapNameToKeys(text)) record(key, LABELS[key], tier, source);
    for (const custom of customs) if (custom.words && containsKeyword(stripped, custom.words)) record(custom.id, custom.value, tier, source);
  };

  const declared = [...(info.contains ?? []), ...splitEntries(inline.containsText)];
  const mayContain = [...(info.mayContain ?? []), ...splitEntries(inline.mayContainText)];
  declared.forEach((entry) => recordText(entry, 'confirmed', `Declared: “${entry}”`));
  mayContain.forEach((entry) => recordText(entry, 'precautionary', `May contain: “${entry}”`));

  for (const item of parseIngredientList(ingredientsText)) {
    const text = strip(item.name);
    for (const [key, { definite, possible }] of Object.entries(ALLERGEN_KEYWORDS)) {
      if (definite.some((word) => containsKeyword(text, word))) record(key, LABELS[key], 'confirmed', `Ingredient: ${item.name}`);
      else if (possible.some((word) => containsKeyword(text, word))) record(key, LABELS[key], 'possible', `Ingredient: ${item.name}`);
    }
    for (const custom of customs) if (custom.words && containsKeyword(text, custom.words)) record(custom.id, custom.value, 'confirmed', `Ingredient: ${item.name}`);
  }
  for (const code of extractAdditiveCodes(ingredientsText)) {
    if (SULPHITE_CODES.includes(code)) record('sulphites', LABELS.sulphites, 'confirmed', `Additive code ${code}`);
    if (code === '322') record('soy', LABELS.soy, 'possible', 'Additive code 322 (lecithin, source not stated)');
  }

  const saved = new Set([...(profile?.allergens ?? []), ...customs.map((c) => c.id)]);
  const detected = [...found.values()]
    .map((entry) => ({ ...entry, sources: [...entry.sources], matchesUser: saved.has(entry.id) }))
    .sort((a, b) => RANK[b.tier] - RANK[a.tier] || a.label.localeCompare(b.label));

  const hasIngredients = ingredientsText.length > 0;
  const hasStatements = declared.length > 0 || mayContain.length > 0;
  let status;
  let reason;
  if (hasIngredients && info.complete === true) {
    status = 'complete';
    reason = 'The ingredient list and allergen statements were confirmed as complete.';
  } else if (!hasIngredients && !hasStatements) {
    status = 'unavailable';
    reason = 'No ingredient list or allergen statement is available for this product.';
  } else {
    status = 'incomplete';
    reason = !hasIngredients
      ? 'The ingredient list is missing, so allergens could not be checked fully.'
      : 'The ingredient list or allergen statements were not confirmed as complete (they may be cut off or unreadable).';
  }

  return {
    status,
    reason,
    noStatementFound: hasIngredients && !hasStatements,
    detected,
    confirmed: detected.filter((d) => d.tier === 'confirmed' && d.matchesUser),
    precautionary: detected.filter((d) => d.tier === 'precautionary' && d.matchesUser),
    possible: detected.filter((d) => d.tier === 'possible' && d.matchesUser),
    hasSavedAllergens: saved.size > 0,
  };
}
