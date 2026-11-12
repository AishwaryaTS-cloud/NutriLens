# NutriLens scoring: formulas, thresholds and rules

All numbers are calculated by deterministic JavaScript in `ai/` (`ai/scoring/config.js` holds every
threshold, score and weight). Gemini never calculates or changes them; it only explains them.

**Honesty note.** Every threshold below is a *project-defined heuristic*, informed by selected nutrition-claim
criteria. They are **not** official regulatory limits, **not** medical classifications and **not** diagnoses.
The scoring version is stored with each scan (`2.0.0`).

> This version replaces the earlier methodology example (a flat 20-point allergen penalty and no ingredient
> score). The formula, penalties and 49-point ceiling below are the current rules.

## 1. Inputs and per-100 g values

All nutrient scoring uses values **per 100 g (or per 100 ml)**. Canonical units: energy kcal, sodium mg, all others g.

- If the label prints a per-100 column, that value is used.
- Otherwise a per-serving value is converted: `V100 = (Vs ÷ S) × 100` (S = serving size). Example: 4 g sugar in a
  50 g serving = 8 g per 100 g.
- A missing value stays **missing** (null). It is never treated as zero, never classified LOW, and is left out of
  averages (and reported in the limitations).
- Units are converted (mg/g/µg, kJ to kcal at 4.184 kJ per kcal). Sodium may be derived from printed salt
  (`sodium = salt ÷ 2.5`) and is flagged when it is.

### Validation (blocks analysis when it fails)
Numbers only; no negatives; per-100 values at most 100 g (sodium at most 40,000 mg, energy at most 910 kcal);
per-serving values cannot exceed the serving size; serving size above 0 and at most 2000; total sugar ≤
carbohydrates; added sugar ≤ total sugar; saturated and trans fat ≤ total fat; protein + fat + carbohydrates ≤ 100 g
per 100 g; per-serving and per-100 columns must agree after conversion (±25 %, with small absolute tolerance), which
catches swapped columns. Rounding tolerance 0.5 g. Warnings (do not block): fibre + sugar above carbohydrates,
energy not close to 4·protein + 4·carbohydrates + 9·fat, missing nutrients.

## 2. LOW / MEDIUM / HIGH (per 100 g)

A value at or below the LOW limit is LOW; otherwise at or below the MEDIUM limit is MEDIUM; otherwise HIGH.

| Nutrient | LOW | MEDIUM | HIGH |
|---|---|---|---|
| Sugar | ≤ 5 g | ≤ 12.5 g | > 12.5 g |
| Protein | ≤ 5 g | ≤ 12 g | > 12 g |
| Fibre | ≤ 1.5 g | ≤ 3 g | > 3 g |
| Sodium | ≤ 120 mg | ≤ 600 mg | > 600 mg |
| Fat | ≤ 3 g | ≤ 17.5 g | > 17.5 g |
| Saturated fat | ≤ 1.5 g | ≤ 5 g | > 5 g |
| Carbohydrates | ≤ 10 g | ≤ 30 g | > 30 g |
| Added sugar (information only, not scored) | ≤ 5 g | ≤ 12.5 g | > 12.5 g |

## 3. Class to score

| Goal | LOW | MEDIUM | HIGH |
|---|---|---|---|
| Lower is better | 100 | 50 | 10 |
| Higher is better | 20 | 60 | 100 |

## 4. Personal Match Score

`Base = Preference × 0.50 + Quality × 0.30 + Ingredients × 0.20` (each part 0 to 100).

### 4.1 Personal Preference Score (50 %)
For each nutrient goal the user saved (goal lower/higher, importance weight 1 to 3) that has a value:
`score = table(goal, class)`. Then `P = Σ(score × weight) ÷ Σ(weight)`.
Worked example: sugar 8 g (MEDIUM, lower, w2 → 50), protein 15 g (HIGH, higher, w3 → 100), sodium 100 mg (LOW,
lower, w1 → 100): `P = (50×2 + 100×3 + 100×1) ÷ 6 = 83.33`.

### 4.2 Nutrition Quality Score (30 %)
Fixed direction and importance per nutrient, using the same class table:

| Nutrient | Better when | Weight |
|---|---|---|
| Sugar | lower | 3 |
| Sodium | lower | 2 |
| Saturated fat | lower | 2 |
| Fat | lower | 1 |
| Carbohydrates | lower | 1 |
| Protein | higher | 2 |
| Fibre | higher | 2 |

`Q = Σ(score × weight) ÷ Σ(weight)` over the nutrients that have values. At least **4 of the 7** must have values;
otherwise no score is produced (`insufficient_data`).

### 4.3 Ingredient Score (20 %)
Starts at a neutral **70** for a readable ingredient list, then:

| Rule | Points |
|---|---|
| Each distinct sugar-type ingredient (sugar, glucose syrup, dextrose, maltodextrin, jaggery, honey…) | −8 (cap −30 for the rule) |
| A sugar-type ingredient listed first (labels list by amount, largest first) | additional −10 |
| Hydrogenated fat, vanaspati, margarine, shortening | −15 each (fat rules capped at −30) |
| Palm oil / palmolein | −8 each |
| Additive kinds: artificial colour, artificial sweetener, preservative, flavour enhancer, artificial flavour (by name or INS code) | −5 per kind (cap −20) |
| Whole or minimally processed ingredients (whole wheat, oats, ragi, millets, pulses, nuts, seeds…) | +6 each (cap +24) |
| Conflict with the saved dietary preference | −40 once |

Result is limited to 0 to 100. No list, no ingredient score (it is left out, not zero). The rules describe what the
list contains; they are not health claims. Dietary conflicts: vegan = meat, fish, egg, dairy, honey; vegetarian and
eggetarian = meat, fish (gelatin, lard and carmine count as meat); pescatarian = meat. A non-vegetarian mark on the
label conflicts with vegetarian or vegan.

### 4.4 Missing components
If the user saved no nutrient goals (or none of them have values) or there is no ingredient list, that component is
left out and the other weights are scaled up proportionally (for example quality 60 %, ingredients 40 %). This is
shown in the results. Without enough nutrition values there is no score at all.

## 5. Allergen safety

Allergens are detected from three sources and kept in three tiers:

| Tier | Meaning | Penalty (only if it matches a saved allergen) |
|---|---|---|
| Confirmed | named in a "Contains" declaration or listed as an ingredient | −40 each distinct allergen |
| Precautionary | named in "May contain / traces of / made in a facility that handles" | −15 each distinct allergen (not counted if the same allergen is confirmed) |
| Possible | an ingredient that may come from an allergen with no stated source (for example lecithin, oats) | no penalty; shown as a concern |

- **Incomplete information:** −10 once when allergen information is unavailable or not confirmed complete, **only when
  the user has saved at least one allergen** (otherwise there is nothing to establish). Information is *complete*
  only when an ingredient list is present and it was confirmed complete (by Gemini's readability report and then
  by you in the review form).
- `Total penalty = sum, capped at 60.`
- `Final = max(0, Base − Total penalty)`, rounded.
- **If any confirmed conflict exists, Final is at most 49**, however high the base score.
- Custom allergens the user typed are matched in ingredients (confirmed) and "may contain" text (precautionary).
- Phrases such as coconut milk and cocoa butter are not treated as milk.
- Allergen warnings are always displayed separately from the number. A product is never called allergen-free or
  safe; incomplete information is reported as "safety could not be established".

## 6. What Gemini does and does not do

- **Reads the image** and returns structured JSON (unreadable fields = null, original units and columns kept).
  The backend treats this JSON as untrusted and validates it.
- **Explains** the finished results from a list of verified facts. Any number in its text that was not in those
  facts causes the text to be rejected and replaced by the rule-based explanation.
