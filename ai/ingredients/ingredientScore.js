import { INGREDIENT_RULES } from '../scoring/config.js';
import { containsKeyword, extractAdditiveCodes, normaliseText, parseIngredientList, splitStatements } from './ingredientParser.js';

/** Project-defined ingredient rule lists. They drive a transparent scoring heuristic, not health claims. */
export const INGREDIENT_LISTS = Object.freeze({
  sugarTypes: ['sugar', 'cane sugar', 'brown sugar', 'icing sugar', 'sucrose', 'glucose', 'glucose syrup', 'liquid glucose', 'fructose', 'high fructose corn syrup', 'corn syrup', 'invert sugar', 'invert syrup', 'dextrose', 'maltose', 'maltodextrin', 'jaggery', 'honey', 'molasses'],
  harmfulFats: ['hydrogenated', 'hydrogenated vegetable oil', 'hydrogenated vegetable fat', 'partially hydrogenated', 'vanaspati', 'margarine', 'shortening', 'interesterified fat', 'bakery shortening'],
  palm: ['palm oil', 'palmolein', 'palm olein', 'refined palm oil', 'palm kernel oil'],
  additiveNames: {
    'artificial colour': ['tartrazine', 'sunset yellow', 'allura red', 'carmoisine', 'ponceau', 'brilliant blue', 'erythrosine', 'indigo carmine', 'artificial colour', 'artificial color', 'synthetic colour'],
    'artificial sweetener': ['aspartame', 'acesulfame', 'acesulfame potassium', 'sucralose', 'saccharin', 'neotame', 'sodium cyclamate'],
    preservative: ['sodium benzoate', 'potassium sorbate', 'sorbic acid', 'benzoic acid', 'calcium propionate', 'sodium propionate', 'potassium metabisulphite', 'sodium metabisulphite'],
    'flavour enhancer': ['monosodium glutamate', 'msg', 'disodium inosinate', 'disodium guanylate', 'flavour enhancer', 'flavor enhancer'],
    'artificial flavour': ['artificial flavour', 'artificial flavor', 'artificial flavouring', 'nature identical flavour'],
  },
  additiveCodes: {
    'artificial colour': ['102', '110', '122', '124', '129', '133', '127', '132', '143'],
    'artificial sweetener': ['950', '951', '954', '955', '961', '952'],
    preservative: ['200', '202', '210', '211', '212', '213', '280', '281', '282', '220', '221', '222', '223', '224', '225', '226', '227', '228'],
    'flavour enhancer': ['621', '627', '631', '635'],
  },
  wholeFoods: ['whole wheat', 'whole grain', 'wholegrain', 'wholemeal', 'whole meal', 'oats', 'rolled oats', 'ragi', 'finger millet', 'jowar', 'sorghum', 'bajra', 'pearl millet', 'millet', 'millets', 'brown rice', 'quinoa', 'lentil', 'lentils', 'chickpea', 'chickpeas', 'moong', 'rajma', 'flax seed', 'flaxseed', 'chia seed', 'pumpkin seed', 'sunflower seed', 'almond', 'almonds', 'walnut', 'walnuts', 'dates', 'dried fruit'],
  animal: {
    meat: ['chicken', 'mutton', 'lamb', 'pork', 'beef', 'bacon', 'ham', 'meat', 'turkey', 'duck', 'gelatin', 'gelatine', 'lard', 'tallow', 'animal fat', 'carmine', 'cochineal', 'shellac'],
    fish: ['fish', 'anchovy', 'tuna', 'salmon', 'fish oil', 'fish sauce', 'prawn', 'shrimp', 'crab', 'lobster', 'krill', 'squid', 'oyster', 'isinglass'],
    egg: ['egg', 'eggs', 'egg white', 'egg yolk', 'egg powder', 'albumen'],
    dairy: ['milk', 'milk solids', 'milk powder', 'skimmed milk', 'whey', 'casein', 'caseinate', 'lactose', 'butter', 'ghee', 'cream', 'curd', 'yogurt', 'yoghurt', 'paneer', 'cheese', 'buttermilk', 'milk fat', 'khoa', 'mawa'],
    honey: ['honey', 'beeswax'],
  },
});

// Which animal-derived groups conflict with each dietary preference.
export const DIET_RESTRICTIONS = Object.freeze({
  vegan: ['meat', 'fish', 'egg', 'dairy', 'honey'],
  vegetarian: ['meat', 'fish'],
  eggetarian: ['meat', 'fish'],
  pescatarian: ['meat'],
  none: [],
});
const GROUP_NAMES = { meat: 'meat or other animal-derived ingredient', fish: 'fish or seafood', egg: 'egg', dairy: 'dairy', honey: 'honey or bee product' };
const NOT_ANIMAL = ['coconut milk', 'coconut cream', 'cocoa butter', 'shea butter', 'cream of tartar', 'peanut butter', 'almond milk', 'soy milk', 'soya milk', 'oat milk', 'rice milk', 'butter bean', 'ham-free'];

const strip = (text) => NOT_ANIMAL.reduce((acc, phrase) => acc.split(phrase).join(' '), normaliseText(text));
const anyMatch = (text, words) => words.find((word) => containsKeyword(text, word));

/**
 * Ingredient Score (0-100): base 70 for a readable list, then transparent rules (see INGREDIENT_RULES).
 * Ingredients are listed by weight on labels, so a sugar-type ingredient first in the list costs extra.
 * Returns score null when no ingredient list is available (never treated as zero).
 */
export function computeIngredientScore({ ingredientsText, foodTypeMark = null, dietaryPreference = 'none' }) {
  const R = INGREDIENT_RULES;
  const { ingredientsText: clean } = splitStatements(ingredientsText ?? '');
  const items = parseIngredientList(clean);
  const diet = DIET_RESTRICTIONS[dietaryPreference] ?? [];
  const dietConflicts = [];
  const limitations = [];

  if (items.length === 0) {
    if (dietaryPreference !== 'none') limitations.push('Dietary suitability could not be checked because there is no ingredient list.');
    return { applicable: false, score: null, base: R.base, findings: [], dietConflicts, limitations: ['No ingredient list is available, so no ingredient score was calculated.', ...limitations], ingredientCount: 0 };
  }

  const findings = [];
  let score = R.base;
  const add = (type, rule, ingredient, points, message) => {
    findings.push({ type, rule, ingredient, points, message });
  };

  // Sugar-type ingredients
  const sugarsSeen = new Set();
  let sugarPoints = 0;
  for (const item of items) {
    const word = anyMatch(strip(item.name), INGREDIENT_LISTS.sugarTypes);
    if (!word || sugarsSeen.has(word)) continue;
    sugarsSeen.add(word);
    let points = R.sugarTypeEach;
    let message = `“${item.name}” is a sugar-type ingredient.`;
    if (item.position === 0 && !item.nested) {
      points += R.sugarFirstIngredient;
      message += ' It is listed first, and labels list ingredients from largest to smallest amount.';
    }
    const allowed = Math.max(points, R.sugarCap - sugarPoints);
    sugarPoints += allowed;
    add('negative', 'sugar_type', item.name, allowed, message);
  }

  // Hydrogenated fats and palm oil
  let fatPoints = 0;
  const fatsSeen = new Set();
  for (const item of items) {
    const text = strip(item.name);
    const harmful = anyMatch(text, INGREDIENT_LISTS.harmfulFats);
    const palm = !harmful && anyMatch(text, INGREDIENT_LISTS.palm);
    const word = harmful ?? palm;
    if (!word || fatsSeen.has(word)) continue;
    fatsSeen.add(word);
    const points = Math.max(harmful ? R.harmfulFatEach : R.palmEach, R.fatCap - fatPoints);
    fatPoints += points;
    add('negative', harmful ? 'hydrogenated_fat' : 'palm_oil', item.name, points, harmful ? `“${item.name}” is a hydrogenated or industrially processed fat.` : `“${item.name}” is palm oil, which this scoring rule treats as less preferred.`);
  }

  // Additives (names and INS / E codes), one per additive kind
  let additivePoints = 0;
  const kindsSeen = new Set();
  const codes = extractAdditiveCodes(clean);
  const hit = (kind, label) => {
    if (kindsSeen.has(kind)) return;
    kindsSeen.add(kind);
    const points = Math.max(R.additiveEach, R.additiveCap - additivePoints);
    additivePoints += points;
    add('negative', 'additive', label, points, `The list includes ${kind === 'preservative' ? 'a' : 'an'} ${kind} (${label}).`);
  };
  for (const [kind, words] of Object.entries(INGREDIENT_LISTS.additiveNames)) {
    for (const item of items) {
      const word = anyMatch(normaliseText(item.name), words);
      if (word) hit(kind, item.name);
    }
  }
  for (const [kind, list] of Object.entries(INGREDIENT_LISTS.additiveCodes)) {
    const code = codes.find((c) => list.includes(c.replace(/[a-z]+$/, '')));
    if (code) hit(kind, `INS ${code}`);
  }

  // Whole / minimally processed foods
  const wholeSeen = new Set();
  let wholePoints = 0;
  for (const item of items) {
    const word = anyMatch(normaliseText(item.name), INGREDIENT_LISTS.wholeFoods);
    if (!word || wholeSeen.has(word)) continue;
    wholeSeen.add(word);
    const points = Math.min(R.wholeFoodEach, R.wholeFoodCap - wholePoints);
    if (points <= 0) break;
    wholePoints += points;
    add('positive', 'whole_food', item.name, points, `“${item.name}” is a whole-grain, pulse, nut/seed or similar minimally processed ingredient.`);
  }

  // Dietary preference
  if (diet.length > 0) {
    for (const group of diet) {
      for (const item of items) {
        const word = anyMatch(strip(item.name), INGREDIENT_LISTS.animal[group]);
        if (word) {
          dietConflicts.push({ group, ingredient: item.name, message: `“${item.name}” is ${group === 'egg' ? 'an' : 'a'} ${GROUP_NAMES[group]} ingredient, which conflicts with a ${dietaryPreference} diet.` });
          break;
        }
      }
    }
    if (foodTypeMark === 'non_veg' && (dietaryPreference === 'vegan' || dietaryPreference === 'vegetarian')) {
      dietConflicts.push({ group: 'mark', ingredient: null, message: 'The label carries the non-vegetarian mark (brown/red dot).' });
    }
    if (dietConflicts.length > 0) add('diet', 'diet_conflict', null, R.dietConflict, `Conflicts with the saved ${dietaryPreference} preference: ${dietConflicts.map((c) => c.message).join(' ')}`);
  }

  score = Math.max(0, Math.min(100, R.base + findings.reduce((sum, f) => sum + f.points, 0)));
  return { applicable: true, score: Math.round(score * 100) / 100, base: R.base, findings, dietConflicts, limitations, ingredientCount: items.filter((i) => !i.nested).length };
}
