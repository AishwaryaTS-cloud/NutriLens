import { CORE_NUTRIENTS, FOOD_TYPE_MARKS, LABEL_NUTRIENTS, NUTRIENT_META, SERVING_UNITS, TEXT_LIMITS, VALIDATION_LIMITS } from './nutrients.js';

const round2 = (n) => Math.round(n * 100) / 100;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const emptyColumn = () => Object.fromEntries(LABEL_NUTRIENTS.map((key) => [key, null]));
export const emptyLabel = () => ({
  productName: null,
  brand: null,
  servingSize: { value: null, unit: null },
  per100Unit: 'g',
  perServing: emptyColumn(),
  per100g: emptyColumn(),
  ingredientsText: null,
  allergenInfo: { contains: [], mayContain: [], complete: null },
  foodTypeMark: null,
});

export function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return text ? text.slice(0, max) : null;
}

function cleanList(value, issues, field) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ field, severity: 'error', code: 'INVALID_TYPE', message: 'This must be a list of names.' });
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    const text = cleanText(typeof entry === 'string' ? entry : '', TEXT_LIMITS.allergenEntryLength);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  if (out.length > TEXT_LIMITS.allergenEntries) {
    issues.push({ field, severity: 'error', code: 'TOO_MANY', message: `Use at most ${TEXT_LIMITS.allergenEntries} entries.` });
    return out.slice(0, TEXT_LIMITS.allergenEntries);
  }
  return out;
}

/** null / '' -> null. Numbers and plain numeric strings are accepted. Anything else is invalid. */
export function parseNumber(value) {
  if (value === null || value === undefined) return { value: null };
  if (typeof value === 'number') return Number.isFinite(value) ? { value } : { invalid: true };
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return { value: null };
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return { value: Number(text) };
  }
  return { invalid: true };
}

const label = (key) => NUTRIENT_META[key].label;
const unitOf = (key) => NUTRIENT_META[key].unit;

function checkColumn(column, columnName, servingValue, issues) {
  const L = VALIDATION_LIMITS;
  const clean = emptyColumn();
  const raw = isObject(column) ? column : {};
  for (const key of LABEL_NUTRIENTS) {
    const field = `${columnName}.${key}`;
    const parsed = parseNumber(raw[key]);
    if (parsed.invalid) {
      issues.push({ field, severity: 'error', code: 'INVALID_TYPE', message: `${label(key)} must be a number.` });
      continue;
    }
    if (parsed.value === null) continue;
    const value = parsed.value;
    if (value < 0) {
      issues.push({ field, severity: 'error', code: 'NEGATIVE_VALUE', message: `${label(key)} cannot be negative.` });
      continue;
    }
    const unit = unitOf(key);
    let max;
    if (columnName === 'per100g') max = key === 'sodium' ? L.maxSodiumMgPer100 : key === 'energyKcal' ? L.maxEnergyKcalPer100 : L.maxGramsPer100 + L.roundingToleranceG;
    else if (servingValue) max = key === 'sodium' ? servingValue * L.sodiumPerGramSaltMg + 10 : key === 'energyKcal' ? servingValue * 9.1 + 5 : servingValue + L.roundingToleranceG;
    else max = key === 'sodium' ? 400000 : key === 'energyKcal' ? 10000 : 2000;
    if (value > max) {
      issues.push({ field, severity: 'error', code: 'OUT_OF_RANGE', message: `${label(key)} of ${value} ${unit} looks too high for this column. Check the number and the column.` });
      continue;
    }
    clean[key] = round2(value);
  }
  return clean;
}

function checkPairs(values, columnName, issues) {
  const tol = VALIDATION_LIMITS.roundingToleranceG;
  const add = (field, code, message) => issues.push({ field: `${columnName}.${field}`, severity: 'error', code, message });
  const { sugar, addedSugar, carbohydrates, fat, saturatedFat, transFat, protein } = values;
  if (sugar !== null && carbohydrates !== null && sugar > carbohydrates + tol) add('sugar', 'SUGAR_EXCEEDS_CARBS', 'Total sugar cannot be more than total carbohydrates.');
  if (addedSugar !== null && sugar !== null && addedSugar > sugar + tol) add('addedSugar', 'ADDED_SUGAR_EXCEEDS_SUGAR', 'Added sugar cannot be more than total sugar.');
  if (saturatedFat !== null && fat !== null && saturatedFat > fat + tol) add('saturatedFat', 'SAT_FAT_EXCEEDS_FAT', 'Saturated fat cannot be more than total fat.');
  if (transFat !== null && fat !== null && transFat > fat + tol) add('transFat', 'TRANS_FAT_EXCEEDS_FAT', 'Trans fat cannot be more than total fat.');
}

function resolvePer100({ perServing, per100g }, serving, issues) {
  const result = {};
  const source = {};
  const mismatches = [];
  for (const key of LABEL_NUTRIENTS) {
    const printed = per100g[key];
    const converted = perServing[key] !== null && serving ? round2((perServing[key] / serving) * 100) : null;
    if (printed !== null) {
      result[key] = printed;
      source[key] = 'label_per_100';
      if (converted !== null) {
        const rule = VALIDATION_LIMITS.columnMismatch;
        const abs = rule.absolute[unitOf(key)];
        if (Math.abs(converted - printed) > Math.max(abs, rule.relative * Math.max(converted, printed))) mismatches.push({ key, printed, converted });
      }
    } else if (converted !== null) {
      result[key] = converted;
      source[key] = 'converted_from_serving';
    } else {
      result[key] = null;
      source[key] = null;
    }
  }
  for (const m of mismatches) {
    issues.push({
      field: `per100g.${m.key}`,
      severity: 'error',
      code: 'COLUMN_MISMATCH',
      message: `${label(m.key)}: the per-100 value (${m.printed} ${unitOf(m.key)}) does not match the per-serving value converted to per 100 (${m.converted} ${unitOf(m.key)}). The columns may be swapped or misread. Correct one of them or clear the per-serving column.`,
    });
  }
  return { result, source };
}

/**
 * Validates a canonical label (the shape the review form edits). Never turns missing values into zero.
 * Returns { ok, label (clean), issues, per100, per100Source, coreAvailable, sufficient }.
 * `ok` is false when any issue has severity "error"; analysis must not run then.
 */
export function validateLabel(input) {
  const issues = [];
  const src = isObject(input) ? input : {};
  const out = emptyLabel();

  out.productName = cleanText(src.productName, TEXT_LIMITS.name);
  out.brand = cleanText(src.brand, TEXT_LIMITS.name);
  out.ingredientsText = cleanText(src.ingredientsText, TEXT_LIMITS.ingredients);
  out.per100Unit = src.per100Unit === 'ml' ? 'ml' : 'g';

  const serving = isObject(src.servingSize) ? src.servingSize : {};
  const parsedServing = parseNumber(serving.value);
  let servingValue = null;
  if (parsedServing.invalid || (parsedServing.value !== null && (parsedServing.value <= 0 || parsedServing.value > VALIDATION_LIMITS.maxServingSize))) {
    issues.push({ field: 'servingSize.value', severity: 'error', code: 'SERVING_SIZE_INVALID', message: `Serving size must be a number above 0 and up to ${VALIDATION_LIMITS.maxServingSize}.` });
  } else if (parsedServing.value !== null) {
    servingValue = round2(parsedServing.value);
    if (!SERVING_UNITS.includes(serving.unit)) {
      issues.push({ field: 'servingSize.unit', severity: 'error', code: 'INVALID_UNIT', message: 'Serving size unit must be g or ml.' });
      servingValue = null;
    }
  }
  if (servingValue !== null) {
    out.servingSize = { value: servingValue, unit: serving.unit };
    if (serving.unit === 'ml') out.per100Unit = 'ml';
  }

  out.perServing = checkColumn(src.perServing, 'perServing', servingValue, issues);
  out.per100g = checkColumn(src.per100g, 'per100g', null, issues);
  checkPairs(out.perServing, 'perServing', issues);
  checkPairs(out.per100g, 'per100g', issues);

  if (servingValue === null && LABEL_NUTRIENTS.some((k) => out.perServing[k] !== null && out.per100g[k] === null)) {
    issues.push({ field: 'servingSize.value', severity: 'warning', code: 'SERVING_SIZE_MISSING', message: 'Some values are per serving but the serving size is missing, so they cannot be converted to per 100 g and are left out of the analysis.' });
  }

  const { result: per100, source: per100Source } = resolvePer100(out, servingValue, issues);

  const macros = ['protein', 'fat', 'carbohydrates'].map((k) => per100[k]);
  if (macros.every((v) => v !== null) && macros.reduce((a, b) => a + b, 0) > 100 + VALIDATION_LIMITS.roundingToleranceG * 2) {
    issues.push({ field: 'per100g.carbohydrates', severity: 'error', code: 'MACROS_EXCEED_100', message: 'Protein + fat + carbohydrates add up to more than 100 g per 100 g. Check these values.' });
  }
  if (per100.sugar !== null && per100.fibre !== null && per100.carbohydrates !== null && per100.sugar + per100.fibre > per100.carbohydrates + 1) {
    issues.push({ field: 'per100g.fibre', severity: 'warning', code: 'FIBRE_SUGAR_EXCEED_CARBS', message: 'Sugar + fibre is more than carbohydrates. Some labels list fibre separately; check the label.' });
  }
  if ([per100.energyKcal, per100.protein, per100.fat, per100.carbohydrates].every((v) => v !== null)) {
    const estimate = 4 * per100.protein + 4 * per100.carbohydrates + 9 * per100.fat;
    const rule = VALIDATION_LIMITS.energyMismatch;
    if (Math.abs(per100.energyKcal - estimate) > Math.max(rule.absolute, rule.relative * per100.energyKcal)) {
      issues.push({ field: 'per100g.energyKcal', severity: 'warning', code: 'ENERGY_MISMATCH', message: 'The energy value does not closely match protein, fat and carbohydrates. Check the numbers (plausibility check only).' });
    }
  }

  const info = isObject(src.allergenInfo) ? src.allergenInfo : {};
  out.allergenInfo = {
    contains: cleanList(info.contains, issues, 'allergenInfo.contains'),
    mayContain: cleanList(info.mayContain, issues, 'allergenInfo.mayContain'),
    complete: typeof info.complete === 'boolean' ? info.complete : null,
  };
  out.foodTypeMark = FOOD_TYPE_MARKS.includes(src.foodTypeMark) ? src.foodTypeMark : null;

  const coreAvailable = CORE_NUTRIENTS.filter((k) => per100[k] !== null).length;
  if (LABEL_NUTRIENTS.every((k) => per100[k] === null)) {
    issues.push({ field: 'per100g', severity: 'warning', code: 'NO_NUTRITION_VALUES', message: 'No nutrition values are available.' });
  } else if (coreAvailable < CORE_NUTRIENTS.length) {
    const missing = CORE_NUTRIENTS.filter((k) => per100[k] === null).map((k) => label(k).toLowerCase());
    issues.push({ field: 'per100g', severity: 'warning', code: 'CORE_MISSING', message: `Missing: ${missing.join(', ')}. Missing values are never treated as zero.` });
  }

  const ok = !issues.some((i) => i.severity === 'error');
  return { ok, label: out, issues, per100, per100Source, coreAvailable, sufficient: coreAvailable >= 4 };
}

// ---- Gemini extraction -> canonical label ----

const MASS_FACTORS = { g: 1, mg: 0.001, mcg: 0.000001, 'µg': 0.000001, ug: 0.000001 };

/** Converts {value, unit} as printed on the label to the canonical unit. Returns { value, issue? }. */
export function convertToCanonical(key, entry) {
  if (entry === null || entry === undefined) return { value: null };
  if (!isObject(entry)) return { value: null, issue: { code: 'AI_FIELD_INVALID', message: 'unreadable value' } };
  const parsed = parseNumber(entry.value);
  if (parsed.invalid) return { value: null, issue: { code: 'AI_FIELD_INVALID', message: 'not a number' } };
  if (parsed.value === null) return { value: null };
  const unit = typeof entry.unit === 'string' ? entry.unit.trim().toLowerCase().replace(/\.$/, '') : '';
  if (key === 'energyKcal') {
    if (unit === 'kcal' || unit === 'kilocalories' || unit === 'cal' ) return { value: parsed.value };
    if (unit === 'kj') return { value: round2(parsed.value / 4.184), note: 'Converted from kJ to kcal (1 kcal = 4.184 kJ).' };
    if (!unit) return { value: parsed.value, note: 'Energy unit was not printed; assumed kcal.' };
    return { value: null, issue: { code: 'INVALID_UNIT', message: `energy unit “${entry.unit}” is not kcal or kJ` } };
  }
  const factor = MASS_FACTORS[unit] ?? (unit === '' ? (key === 'sodium' ? 0.001 : 1) : undefined);
  if (factor === undefined) return { value: null, issue: { code: 'INVALID_UNIT', message: `unit “${entry.unit}” is not valid for ${label(key).toLowerCase()}` } };
  const grams = parsed.value * factor;
  const note = unit === '' ? `${label(key)} unit was not printed; assumed ${unitOf(key)}.` : undefined;
  return { value: round2(key === 'sodium' ? grams * 1000 : grams), note };
}

function convertColumn(raw, columnName, issues, units) {
  const column = emptyColumn();
  const source = isObject(raw) ? raw : {};
  for (const key of LABEL_NUTRIENTS) {
    const { value, issue, note } = convertToCanonical(key, source[key]);
    if (issue) issues.push({ field: `${columnName}.${key}`, severity: 'warning', code: issue.code, message: `${label(key)}: ${issue.message}. Please enter it yourself.` });
    if (note) issues.push({ field: `${columnName}.${key}`, severity: 'warning', code: 'UNIT_NOTE', message: note });
    column[key] = value;
    if (isObject(source[key]) && source[key].unit) units[`${columnName}.${key}`] = String(source[key].unit).slice(0, 12);
  }
  if (column.sodium === null && isObject(source.salt)) {
    const salt = convertToCanonical('sugar', source.salt); // salt is a mass in g
    if (salt.value !== null) {
      column.sodium = round2(salt.value * VALIDATION_LIMITS.sodiumPerGramSaltMg);
      issues.push({ field: `${columnName}.sodium`, severity: 'warning', code: 'SODIUM_DERIVED_FROM_SALT', message: 'Sodium was calculated from the printed salt value (sodium = salt ÷ 2.5). Check it against the label.' });
    }
  }
  return column;
}

const stringList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 120)).slice(0, 30) : []);

/**
 * Turns the (already JSON-parsed) Gemini response into the canonical label plus issues and
 * readability information. Unreadable or invalid fields become null, never zero.
 */
export function normaliseExtraction(raw) {
  const issues = [];
  const src = isObject(raw) ? raw : {};
  const units = {};
  const draft = emptyLabel();

  draft.productName = src.productName;
  draft.brand = src.brand;
  const serving = isObject(src.servingSize) ? src.servingSize : {};
  const unit = typeof serving.unit === 'string' ? serving.unit.trim().toLowerCase() : '';
  draft.servingSize = { value: serving.value, unit: unit === 'gm' || unit === 'gram' || unit === 'grams' ? 'g' : unit === 'millilitre' || unit === 'milliliter' ? 'ml' : unit };
  const nutrition = isObject(src.nutrition) ? src.nutrition : {};
  draft.perServing = convertColumn(nutrition.perServing, 'perServing', issues, units);
  draft.per100g = convertColumn(nutrition.per100g, 'per100g', issues, units);
  if (nutrition.per100Basis === 'ml') draft.per100Unit = 'ml';
  const ingredients = isObject(src.ingredients) ? src.ingredients : {};
  draft.ingredientsText = ingredients.text;
  const allergens = isObject(src.allergens) ? src.allergens : {};
  draft.allergenInfo = {
    contains: stringList(allergens.contains),
    mayContain: stringList(allergens.mayContain),
    complete: ingredients.complete === true && allergens.sectionReadable !== false ? true : ingredients.complete === false || allergens.sectionReadable === false ? false : null,
  };
  draft.foodTypeMark = src.foodTypeMark;

  const validated = validateLabel(draft);
  const readability = isObject(src.readability) ? src.readability : {};
  const isFoodLabel = src.isFoodLabel !== false;
  const unreadableFields = stringList(readability.unreadableFields);
  const uncertainFields = stringList(readability.uncertainFields);
  const imageQuality = ['good', 'fair', 'poor'].includes(readability.imageQuality) ? readability.imageQuality : null;
  const nothing = LABEL_NUTRIENTS.every((k) => validated.per100[k] === null) && !validated.label.ingredientsText && !validated.label.productName;
  const status = !isFoodLabel || nothing ? 'empty' : unreadableFields.length || uncertainFields.length || imageQuality === 'poor' || !validated.ok ? 'partial' : 'ok';

  return {
    status,
    isFoodLabel,
    label: validated.label,
    issues: [...issues, ...validated.issues],
    readability: { imageQuality, unreadableFields, uncertainFields, notes: stringList(readability.notes) },
    originalUnits: units,
    columnsFound: stringList(nutrition.columnsFound),
  };
}
