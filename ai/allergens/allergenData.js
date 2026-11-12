/**
 * Allergen keyword lists. Keys match the profile's allergen keys (server/config/nutrition.js).
 *
 * - `definite`: an ingredient or declaration naming one of these means the allergen is present.
 * - `possible`: ingredient-derived concern only. The ingredient MAY come from the allergen
 *   (for example "lecithin" with no named source), so it is reported but never treated as a
 *   confirmed declaration.
 * - Project-defined keyword lists, not an official regulatory list. Check the printed label.
 */
export const ALLERGEN_KEYWORDS = Object.freeze({
  milk: {
    definite: ['milk', 'milk solids', 'milk powder', 'skimmed milk', 'skim milk', 'milk fat', 'whey', 'whey protein', 'casein', 'caseinate', 'lactose', 'butter', 'ghee', 'cream', 'curd', 'yogurt', 'yoghurt', 'paneer', 'cheese', 'buttermilk', 'khoa', 'mawa', 'dairy', 'milk protein'],
    possible: ['lactic acid', 'natural flavour containing milk'],
  },
  eggs: {
    definite: ['egg', 'eggs', 'egg white', 'egg yolk', 'egg powder', 'albumen', 'albumin', 'mayonnaise', 'lysozyme', 'ovalbumin'],
    possible: [],
  },
  peanuts: {
    definite: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'arachis', 'peanut butter', 'peanut oil'],
    possible: [],
  },
  treeNuts: {
    definite: ['almond', 'almonds', 'cashew', 'cashews', 'cashew nut', 'walnut', 'walnuts', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'pecan', 'pecans', 'macadamia', 'brazil nut', 'brazil nuts', 'pine nut', 'pine nuts', 'chestnut', 'tree nut', 'tree nuts', 'nuts', 'mixed nuts', 'marzipan', 'praline'],
    possible: [],
  },
  soy: {
    definite: ['soy', 'soya', 'soybean', 'soybeans', 'soya bean', 'soya beans', 'soy lecithin', 'soya lecithin', 'soy protein', 'soya protein', 'soy flour', 'soya flour', 'tofu', 'edamame', 'tempeh', 'miso', 'soy sauce', 'textured soy protein', 'soya chunks'],
    possible: ['lecithin', 'emulsifier 322', 'ins 322', 'e322', 'hydrolysed vegetable protein', 'hydrolyzed vegetable protein', 'vegetable protein'],
  },
  gluten: {
    definite: ['wheat', 'wheat flour', 'whole wheat', 'atta', 'maida', 'refined wheat flour', 'semolina', 'rava', 'suji', 'sooji', 'barley', 'rye', 'spelt', 'triticale', 'gluten', 'wheat gluten', 'durum', 'couscous', 'bulgur', 'seitan', 'malt extract', 'barley malt'],
    possible: ['oats', 'rolled oats', 'oat flour', 'malt', 'modified starch', 'starch', 'cereal'],
  },
  fish: {
    definite: ['fish', 'anchovy', 'anchovies', 'tuna', 'salmon', 'cod', 'sardine', 'sardines', 'mackerel', 'fish oil', 'fish sauce', 'fish extract', 'surimi', 'isinglass'],
    possible: ['omega-3'],
  },
  crustaceans: {
    definite: ['shrimp', 'shrimps', 'prawn', 'prawns', 'crab', 'lobster', 'crayfish', 'krill', 'crustacean', 'crustaceans', 'shellfish'],
    possible: [],
  },
  sesame: {
    definite: ['sesame', 'sesame seed', 'sesame seeds', 'sesame oil', 'tahini', 'gingelly', 'til', 'benne seed'],
    possible: [],
  },
  sulphites: {
    definite: ['sulphite', 'sulphites', 'sulfite', 'sulfites', 'sulphur dioxide', 'sulfur dioxide', 'metabisulphite', 'metabisulfite', 'sodium metabisulphite', 'potassium metabisulphite', 'bisulphite', 'bisulfite'],
    possible: [],
  },
});

/** INS / E codes for sulphites (220-228). */
export const SULPHITE_CODES = Object.freeze(['220', '221', '222', '223', '224', '225', '226', '227', '228']);

/** Words that, when printed in an allergen statement, name an allergen. Used to map statement entries to keys. */
export const ALLERGEN_NAME_KEYWORDS = Object.freeze(
  Object.fromEntries(Object.entries(ALLERGEN_KEYWORDS).map(([key, { definite }]) => [key, definite])),
);
