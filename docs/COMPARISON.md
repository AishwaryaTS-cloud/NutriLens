# Food Product Comparison

Compare two products on nutrition, ingredients, allergens and scores. Built on the existing analysis and scoring code:
no second scoring system, no new database model, no new dependency.

## How it works

1. **Pick products** (`/compare`): two saved scans, or a product you just analysed (not saved) plus one saved scan.
   Entry points: History compare bar, "Compare with another product" on a saved scan, and "Compare with a saved product" on fresh results.
2. **Server** loads/analyses both with `analyseLabel` and the user's *current* profile (the same function used everywhere),
   then `ai/comparison/compareProducts.js` derives the comparison. It only reads the analyses; it never recalculates a score.
3. **UI** (`ComparisonView`) renders: allergen alert, product cards, summary, allergens, scores, nutrition, ingredients, notes.

## Rules (all in `ai/comparison/compareProducts.js`)

- **Nutrients** (per 100 g/ml): energy, sugar, added sugar, protein, fibre, fat, saturated fat, carbohydrates, sodium, with units.
  "Better" direction = the user's own goal for that nutrient if saved, otherwise the project's `QUALITY_RULES`
  (less sugar/sodium/fat/carbs, more protein/fibre). Energy and added sugar are shown, never judged.
  Differences within rounding tolerance are "similar". Missing values are never compared. g vs ml products get no verdicts.
- **Ingredients**: parsed with the existing parser (case, percentages and bracketed sub-ingredients normalised); common / only A / only B;
  differences = scoring findings and diet conflicts only one product has, plus additive codes. No list => not comparable, stated plainly.
- **Allergens**: from the existing detector. Common / only A / only B with tier (Contains, May contain, Possible source),
  flagged when in the user's saved allergens. Incomplete allergen info is never treated as "allergen free".
- **Scores**: Personal Match, Personal Preference, Nutrition Quality, Ingredient Score from the existing components.
  Winner only when both have a score (exact rule used before); ties are ties; gaps under 5 points are described as small;
  scores based on limited information are labelled, with the real limitation text.
- **Summary**: every sentence is generated from fields of the comparison (tests assert every quoted number exists in the data).
  Allergen conflicts come first.

## API

Reused (response extended, backward compatible): `GET /api/scans/compare?a=ID&b=ID` returns the old `{a, b, winner, notes}`
**plus** `details` (the structure above) and `saved` on each side.

New: `POST /api/scans/compare` with `{ a, b }`, each side either `{ scanId }` or `{ label }` (a validated label of a newly analysed,
unsaved product). Same auth, same-origin and validation rules as the other scan routes. Nothing is saved. Errors: 400 invalid body or
same product twice, 404 unknown scan, 422 invalid label.

**Database changes: none.**

## Files

Created: `ai/comparison/compareProducts.js`, `server/tests/comparison.test.js`, `client/src/components/ComparisonView.jsx`,
`client/src/components/ProductPicker.jsx`, `client/src/hooks/compareView.js` (+ `.test.js`), `client/src/assets/styles/compare.css`.
Modified: `server/services/scanService.js`, `server/controllers/scanController.js`, `server/routes/scans.js`,
`client/src/pages/Compare.jsx`, `Scan.jsx`, `ScanDetail.jsx`, `client/src/services/scanService.js`,
`client/src/assets/styles/index.css`, `results.css` (old compare rules removed).

## Known limitations

- Only per-100 values are compared (not per serving).
- Ingredient matching is by normalised name: synonyms ("maida" vs "wheat flour") are not merged.
- Allergen results are exactly as good as the existing detector; always check the printed label.
- An unsaved product travels in browser navigation state: no shareable URL, and one unsaved product at a time (the other must be saved).
- Saved scores are recalculated with current preferences, so they can differ from the score stored at scan time.
