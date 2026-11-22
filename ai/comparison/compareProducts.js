import { NUTRIENT_META } from '../nutrition/nutrients.js';
import { extractAdditiveCodes, normaliseText, parseIngredientList, splitStatements } from '../ingredients/ingredientParser.js';
import { QUALITY_RULES } from '../scoring/config.js';

/**
 * Food Product Comparison: a pure, deterministic function over two EXISTING analyses
 * (the output of analyseLabel). It never recalculates a score and never calls Gemini.
 * Every sentence in `summary` is generated from a field in the data it is given.
 *
 * Input:  { a, b, profile }  where a / b = { name, brand, analysis }
 * Output: { names, comparable, nutrients, ingredients, allergens, scores, summary, notes, winner }
 */

export const NUTRIENT_ROWS = Object.freeze(['energyKcal', 'sugar', 'addedSugar', 'protein', 'fibre', 'fat', 'saturatedFat', 'carbohydrates', 'sodium']);

// Differences smaller than this are reported as "similar" (labels round to 0.1-0.5 g).
const SIMILAR = Object.freeze({ g: 0.5, mg: 10, kcal: 10, relative: 0.05 });
const TIER_TEXT = Object.freeze({ confirmed: 'Contains', precautionary: 'May contain', possible: 'Possible source' });
const TIER_RANK = Object.freeze({ confirmed: 3, precautionary: 2, possible: 1 });
const SCORE_PARTS = Object.freeze([
  ['preference', 'Personal Preference'],
  ['quality', 'Nutrition Quality'],
  ['ingredient', 'Ingredient Score'],
]);

const round1 = (n) => Math.round(n * 10) / 10;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const joinWords = (list) => (list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(round1(n)));
const lowerLabel = (key) => NUTRIENT_META[key].label.toLowerCase();

/** Which direction is "better" for a nutrient: the user's own goal first, then the project's general guidance. */
function directionFor(key, profile) {
  const pref = (profile?.nutrientPreferences ?? []).find((p) => p.nutrient === key);
  if (pref && (pref.goal === 'lower' || pref.goal === 'higher')) return { direction: pref.goal, source: 'goal', weight: pref.weight ?? 1 };
  const rule = QUALITY_RULES[key];
  if (rule) return { direction: rule.direction, source: 'guidance', weight: rule.weight };
  return { direction: null, source: null, weight: 0 }; // energy and added sugar: shown, never judged
}

function relation(x, y, unit) {
  const diff = Math.abs(x - y);
  const tolerance = Math.max(SIMILAR[unit] ?? 0, Math.max(Math.abs(x), Math.abs(y)) * SIMILAR.relative);
  if (diff <= tolerance) return 'similar';
  return x > y ? 'a_higher' : 'b_higher';
}

function compareNutrients(a, b, profile, unitMismatch) {
  return NUTRIENT_ROWS.map((key) => {
    const meta = NUTRIENT_META[key];
    const va = a.analysis.per100?.[key] ?? null;
    const vb = b.analysis.per100?.[key] ?? null;
    const { direction, source, weight } = directionFor(key, profile);
    const row = {
      key, label: meta.label, unit: meta.unit, a: isNum(va) ? va : null, b: isNum(vb) ? vb : null,
      levelA: a.analysis.nutrients?.[key]?.level ?? null, levelB: b.analysis.nutrients?.[key]?.level ?? null,
      direction, directionSource: source, weight,
      relation: 'unknown', difference: null, better: null, missing: [],
    };
    if (row.a === null) row.missing.push('a');
    if (row.b === null) row.missing.push('b');
    if (row.missing.length === 0) {
      row.relation = relation(row.a, row.b, meta.unit);
      row.difference = round1(Math.abs(row.a - row.b));
      // A verdict needs a direction AND comparable bases (per 100 g vs per 100 ml is not comparable).
      if (direction && row.relation !== 'similar' && !unitMismatch) {
        const aIsHigher = row.relation === 'a_higher';
        row.better = aIsHigher === (direction === 'higher') ? 'a' : 'b';
      }
    }
    return row;
  });
}

function ingredientKey(name) {
  return normaliseText(name).replace(/\d+(\.\d+)?\s*%/g, '').replace(/\s+/g, ' ').trim();
}

function ingredientsOf(analysis) {
  const text = splitStatements(analysis.label.ingredientsText ?? '').ingredientsText;
  const seen = new Set();
  const items = [];
  for (const item of parseIngredientList(text)) {
    const key = ingredientKey(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, name: item.name.trim(), position: item.position });
  }
  return { text, items };
}

function compareIngredients(a, b) {
  const la = ingredientsOf(a.analysis);
  const lb = ingredientsOf(b.analysis);
  const availableA = la.items.length > 0;
  const availableB = lb.items.length > 0;
  const out = { available: { a: availableA, b: availableB }, comparable: availableA && availableB, counts: { a: la.items.length, b: lb.items.length }, common: [], onlyA: [], onlyB: [], firstIngredient: { a: la.items[0]?.name ?? null, b: lb.items[0]?.name ?? null }, flags: [], additives: { a: [], b: [] }, textA: la.text || null, textB: lb.text || null };
  if (!out.comparable) return out;

  const keysB = new Set(lb.items.map((i) => i.key));
  const keysA = new Set(la.items.map((i) => i.key));
  out.common = la.items.filter((i) => keysB.has(i.key)).map((i) => i.name);
  out.onlyA = la.items.filter((i) => !keysB.has(i.key)).map((i) => i.name);
  out.onlyB = lb.items.filter((i) => !keysA.has(i.key)).map((i) => i.name);

  // Important differences: scoring findings and diet conflicts that only one product has.
  const finding = (analysis) => analysis.match.details.ingredient.findings ?? [];
  const msgKey = (f) => normaliseText(f.message);
  const keysFa = new Set(finding(a.analysis).map(msgKey));
  const keysFb = new Set(finding(b.analysis).map(msgKey));
  for (const f of finding(a.analysis)) if (!keysFb.has(msgKey(f))) out.flags.push({ side: 'a', kind: f.points < 0 ? 'concern' : 'positive', message: f.message, points: f.points });
  for (const f of finding(b.analysis)) if (!keysFa.has(msgKey(f))) out.flags.push({ side: 'b', kind: f.points < 0 ? 'concern' : 'positive', message: f.message, points: f.points });
  for (const [side, item] of [['a', a], ['b', b]]) {
    for (const c of item.analysis.match.details.ingredient.dietConflicts ?? []) out.flags.push({ side, kind: 'diet', message: c.message, points: null });
  }
  out.additives = { a: extractAdditiveCodes(la.text), b: extractAdditiveCodes(lb.text) };
  return out;
}

function allergenEntries(analysis) {
  return (analysis.match.allergens.detected ?? []).map((d) => ({ id: d.id, label: d.label, tier: d.tier, tierText: TIER_TEXT[d.tier] ?? d.tier, matchesUser: Boolean(d.matchesUser), sources: d.sources ?? [] }));
}

function compareAllergens(a, b) {
  const ea = allergenEntries(a.analysis);
  const eb = allergenEntries(b.analysis);
  const mapB = new Map(eb.map((e) => [e.id, e]));
  const mapA = new Map(ea.map((e) => [e.id, e]));
  const side = (item, entries) => {
    const m = item.analysis.match;
    return { entries, status: m.allergens.status, reason: m.allergens.reason, complete: m.allergens.status === 'complete', hasSavedAllergens: Boolean(m.allergens.hasSavedAllergens), conflict: Boolean(m.allergenPenalty.hasConfirmedConflict), penalty: m.allergenPenalty.total, relevant: entries.filter((e) => e.matchesUser && e.tier !== 'possible') };
  };
  return {
    a: side(a, ea), b: side(b, eb),
    common: ea.filter((e) => mapB.has(e.id)).map((e) => ({ ...e, tierA: e.tier, tierB: mapB.get(e.id).tier, tierTextA: e.tierText, tierTextB: mapB.get(e.id).tierText })),
    onlyA: ea.filter((e) => !mapB.has(e.id)),
    onlyB: eb.filter((e) => !mapA.has(e.id)),
  };
}

function compareScores(a, b) {
  const ma = a.analysis.match;
  const mb = b.analysis.match;
  const lead = (x, y) => (!isNum(x) || !isNum(y) ? null : x === y ? 'tie' : x > y ? 'a' : 'b');
  const personal = { a: ma.finalScore ?? null, b: mb.finalScore ?? null, leader: lead(ma.finalScore, mb.finalScore) };
  personal.margin = isNum(personal.a) && isNum(personal.b) ? Math.abs(personal.a - personal.b) : null;
  const parts = SCORE_PARTS.map(([key, label]) => {
    const x = ma.components?.[key]?.score ?? null;
    const y = mb.components?.[key]?.score ?? null;
    return { key, label, a: x, b: y, leader: lead(x, y), margin: isNum(x) && isNum(y) ? Math.abs(x - y) : null };
  });
  return { personal, parts, base: { a: ma.baseScore ?? null, b: mb.baseScore ?? null }, allergenPenalty: { a: ma.allergenPenalty.total, b: mb.allergenPenalty.total }, status: { a: ma.status, b: mb.status }, partial: { a: ma.status === 'partial', b: mb.status === 'partial' } };
}

/** Plain-language reasons behind the score gap, taken straight from component scores and penalties. */
function explainScores(scores, names) {
  const out = [];
  const nm = (side) => names[side];
  for (const p of scores.parts) {
    if (p.leader === 'a' || p.leader === 'b') {
      if (p.margin >= 1) out.push(`${nm(p.leader)} scores higher on ${p.label} (${Math.round(p.a)} vs ${Math.round(p.b)}).`);
    } else if (p.leader === null && (isNum(p.a) !== isNum(p.b))) {
      const missing = isNum(p.a) ? 'b' : 'a';
      out.push(`${p.label} is not available for ${nm(missing)}, so it could not be compared.`);
    }
  }
  const pa = scores.allergenPenalty.a;
  const pb = scores.allergenPenalty.b;
  if (pa !== pb) {
    const hit = pa > pb ? 'a' : 'b';
    out.push(`${nm(hit)} lost ${Math.max(pa, pb) - Math.min(pa, pb)} more points to allergen penalties for your saved allergens.`);
  }
  return out;
}

function nutrientSentence(row, names, basis) {
  const winner = names[row.better];
  const loser = names[row.better === 'a' ? 'b' : 'a'];
  const vw = row.better === 'a' ? row.a : row.b;
  const vl = row.better === 'a' ? row.b : row.a;
  const more = row.direction === 'higher';
  const goal = row.directionSource === 'goal' ? ` This fits your goal of ${row.direction === 'higher' ? 'more' : 'less'} ${lowerLabel(row.key)}.` : '';
  return `${winner} contains ${more ? 'more' : 'less'} ${lowerLabel(row.key)} than ${loser} (${fmt(vw)} ${row.unit} vs ${fmt(vl)} ${row.unit} per 100 ${basis}).${goal}`.trim();
}

function buildSummary({ names, nutrients, ingredients, allergens, scores, winner, basis }) {
  const out = [];
  // 1. Allergens first: anything relevant to the user's saved allergens.
  for (const side of ['a', 'b']) {
    const rel = allergens[side].relevant;
    if (rel.length > 0) {
      const confirmed = rel.filter((e) => e.tier === 'confirmed').map((e) => e.label);
      const maybe = rel.filter((e) => e.tier === 'precautionary').map((e) => e.label);
      const parts = [];
      if (confirmed.length) parts.push(`contains ${joinWords(confirmed)}`);
      if (maybe.length) parts.push(`may contain ${joinWords(maybe)}`);
      out.push({ kind: 'allergen', tone: 'danger', side, text: `${names[side]} ${parts.join(' and ')}, which ${rel.length === 1 ? 'is' : 'are'} in your saved allergens.` });
    }
  }
  for (const side of ['a', 'b']) {
    if (!allergens[side].complete) out.push({ kind: 'allergen', tone: 'warn', side, text: `Allergen information for ${names[side]} is incomplete, so it cannot be treated as free of any allergen.` });
  }
  const savedRelevant = allergens.a.relevant.length + allergens.b.relevant.length;
  if (savedRelevant === 0 && (allergens.onlyA.length || allergens.onlyB.length)) {
    const bits = [];
    if (allergens.onlyA.length) bits.push(`only ${names.a} has ${joinWords(allergens.onlyA.map((e) => e.label))}`);
    if (allergens.onlyB.length) bits.push(`only ${names.b} has ${joinWords(allergens.onlyB.map((e) => e.label))}`);
    out.push({ kind: 'allergen', tone: 'info', text: `Allergen difference: ${bits.join('; ')}.` });
  }

  // 2. Score.
  const partialSides = ['a', 'b'].filter((side) => scores.status[side] === 'partial');
  const caveat = partialSides.length ? ` ${joinWords(partialSides.map((side) => names[side]))} ${partialSides.length > 1 ? 'were' : 'was'} scored with limited information, so treat this as a guide.` : '';
  if (winner === 'a' || winner === 'b') {
    const other = winner === 'a' ? 'b' : 'a';
    out.push({ kind: 'score', tone: partialSides.length ? 'warn' : 'good', side: winner, text: `${names[winner]} has the higher Personal Match Score (${scores.personal[winner]} vs ${scores.personal[other]}).${caveat}` });
  } else if (winner === 'tie') {
    out.push({ kind: 'score', tone: 'info', text: `Both products have the same Personal Match Score (${scores.personal.a}).${caveat}` });
  } else {
    out.push({ kind: 'score', tone: 'warn', text: 'No overall winner is named because at least one product could not be scored.' });
  }

  // 3. Nutrients: the most relevant verdicts first (user's weights, then general weights).
  const verdicts = nutrients.filter((r) => r.better).sort((x, y) => y.weight - x.weight).slice(0, 4);
  for (const row of verdicts) out.push({ kind: 'nutrient', tone: 'good', side: row.better, nutrient: row.key, text: nutrientSentence(row, names, basis) });
  const energy = nutrients.find((r) => r.key === 'energyKcal');
  if (energy && energy.relation !== 'similar' && energy.relation !== 'unknown') {
    const lowerSide = energy.relation === 'a_higher' ? 'b' : 'a';
    out.push({ kind: 'nutrient', tone: 'info', text: `${names[lowerSide]} has fewer calories (${fmt(lowerSide === 'a' ? energy.a : energy.b)} vs ${fmt(lowerSide === 'a' ? energy.b : energy.a)} kcal per 100 ${basis}). Energy is shown for information and is not judged.` });
  }

  // 4. Ingredients.
  if (ingredients.comparable) {
    const concerns = ingredients.flags.filter((f) => f.kind === 'concern' || f.kind === 'diet').slice(0, 2);
    for (const f of concerns) out.push({ kind: 'ingredient', tone: 'warn', side: f.side, text: `${names[f.side]}: ${f.message}` });
  }
  return out;
}

function buildNotes({ names, nutrients, ingredients, allergens, scores, unitMismatch, limitations }) {
  const notes = [];
  if (unitMismatch) notes.push('One product is measured per 100 g and the other per 100 ml, so nutrient differences are shown but not judged.');
  const bothMissing = nutrients.filter((r) => r.missing.length === 2).map((r) => r.label);
  if (bothMissing.length) notes.push(`Not available for either product: ${joinWords(bothMissing)}.`);
  for (const side of ['a', 'b']) {
    const missing = nutrients.filter((r) => r.missing.length === 1 && r.missing[0] === side).map((r) => r.label);
    if (missing.length) notes.push(`Missing for ${names[side]}, so they can’t be compared: ${joinWords(missing)}.`);
  }
  for (const side of ['a', 'b']) {
    if (!ingredients.available[side]) notes.push(`No ingredient list is available for ${names[side]}, so ingredients cannot be compared.`);
    if (scores.status[side] === 'partial') for (const text of limitations[side]) notes.push(`${names[side]}: ${text}`);
  }
  if (!allergens.a.hasSavedAllergens) notes.push('You have not saved any allergens, so allergen warnings cannot be matched to you. Add them in your profile.');
  return notes;
}

export function compareProducts({ a, b, profile }) {
  const names = { a: a.name?.trim() || 'Product A', b: b.name?.trim() || 'Product B' };
  if (names.a === names.b) { names.a = `${names.a} (A)`; names.b = `${names.b} (B)`; }
  const unitA = a.analysis.label.per100Unit ?? 'g';
  const unitB = b.analysis.label.per100Unit ?? 'g';
  const unitMismatch = unitA !== unitB;

  const scores = compareScores(a, b);
  // Never invent a winner: both products need a score.
  const winner = scores.personal.leader;
  const nutrients = compareNutrients(a, b, profile, unitMismatch);
  const ingredients = compareIngredients(a, b);
  const allergens = compareAllergens(a, b);
  const limitations = { a: a.analysis.match.limitations ?? [], b: b.analysis.match.limitations ?? [] };
  const ctx = { names, nutrients, ingredients, allergens, scores, winner, unitMismatch, basis: unitA, limitations };

  return {
    names, basis: { a: unitA, b: unitB, mismatch: unitMismatch },
    winner, nutrients, ingredients, allergens,
    scores: { ...scores, explanation: explainScores(scores, names) },
    summary: buildSummary(ctx),
    notes: buildNotes(ctx),
  };
}
