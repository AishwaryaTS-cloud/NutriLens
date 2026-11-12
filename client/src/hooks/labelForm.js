/**
 * Pure helpers for the label review form (no React), so they can be tested.
 * The form keeps every field as text; formToLabel turns it into the label object the server validates.
 */
export const NUTRIENT_ROWS = Object.freeze([
  { key: 'energyKcal', label: 'Energy', unit: 'kcal' },
  { key: 'sugar', label: 'Total sugar', unit: 'g' },
  { key: 'addedSugar', label: 'Added sugar', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Total fat', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g' },
  { key: 'transFat', label: 'Trans fat', unit: 'g' },
  { key: 'carbohydrates', label: 'Carbohydrates', unit: 'g' },
  { key: 'fibre', label: 'Dietary fibre', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
]);

export const DIET_MARKS = Object.freeze([
  { value: '', label: 'Not shown' },
  { value: 'veg', label: 'Green dot (vegetarian)' },
  { value: 'non_veg', label: 'Brown/red dot (non-vegetarian)' },
  { value: 'vegan', label: 'Vegan mark' },
]);

const text = (value) => (value === null || value === undefined ? '' : String(value));
const column = (source = {}) => Object.fromEntries(NUTRIENT_ROWS.map(({ key }) => [key, text(source?.[key])]));

export function emptyForm() {
  return labelToForm(null);
}

/** Canonical label (or null) -> text fields for the form. */
export function labelToForm(label) {
  const l = label ?? {};
  const info = l.allergenInfo ?? {};
  return {
    productName: text(l.productName),
    brand: text(l.brand),
    servingValue: text(l.servingSize?.value),
    servingUnit: l.servingSize?.unit ?? 'g',
    per100g: column(l.per100g),
    perServing: column(l.perServing),
    ingredientsText: text(l.ingredientsText),
    contains: (info.contains ?? []).join(', '),
    mayContain: (info.mayContain ?? []).join(', '),
    allergenComplete: info.complete === true ? 'yes' : info.complete === false ? 'no' : 'unknown',
    foodTypeMark: l.foodTypeMark ?? '',
  };
}

export const parseList = (value) => [...new Set(String(value ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))];

/** '' -> null; a numeric string -> number; anything else stays as typed so the server can flag it. */
export function toNumberOrRaw(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') return null;
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed) ? Number(trimmed) : trimmed;
}

const numbers = (source) => Object.fromEntries(NUTRIENT_ROWS.map(({ key }) => [key, toNumberOrRaw(source[key])]));

/** Form text fields -> the label object sent to /analyse and /scans. Missing values are null, never 0. */
export function formToLabel(form) {
  const serving = toNumberOrRaw(form.servingValue);
  return {
    productName: form.productName.trim() || null,
    brand: form.brand.trim() || null,
    servingSize: { value: serving, unit: serving === null ? null : form.servingUnit },
    per100Unit: form.servingUnit === 'ml' ? 'ml' : 'g',
    per100g: numbers(form.per100g),
    perServing: numbers(form.perServing),
    ingredientsText: form.ingredientsText.trim() || null,
    allergenInfo: {
      contains: parseList(form.contains),
      mayContain: parseList(form.mayContain),
      complete: form.allergenComplete === 'yes' ? true : form.allergenComplete === 'no' ? false : null,
    },
    foodTypeMark: form.foodTypeMark || null,
  };
}

/** [{field, severity, message}] -> { field: [{severity, message}] } */
export function issuesByField(issues = []) {
  const map = {};
  for (const issue of issues) (map[issue.field] ??= []).push({ severity: issue.severity, message: issue.message });
  return map;
}

export const hasErrors = (issues = []) => issues.some((i) => i.severity === 'error');

/** A simple pre-check so obvious mistakes are caught before a request is made (the server checks again). */
export function quickCheck(form) {
  const problems = [];
  const bad = (value) => typeof toNumberOrRaw(value) === 'string';
  for (const { key, label } of NUTRIENT_ROWS) {
    if (bad(form.per100g[key]) || bad(form.perServing[key])) problems.push(`${label} must be a number.`);
  }
  if (bad(form.servingValue)) problems.push('Serving size must be a number.');
  return problems;
}

export const scoreTone = (score) => (score === null || score === undefined ? 'none' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor');

export const LEVEL_TEXT = Object.freeze({ LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' });
