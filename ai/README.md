# ai/ : label analysis modules

Pure JavaScript modules used by the Express server (`server/services/scanService.js`). There is **no OCR engine**:
the label image is sent to Gemini Vision, and everything after that is validated, deterministic code.

| Folder | Purpose |
|---|---|
| `gemini/` | `geminiClient.js` (REST client, error classes), `labelExtractor.js` (image to structured JSON), `explainer.js` (explains calculated results, with a rule-based fallback) |
| `nutrition/` | `labelValidator.js` (types, units, ranges, per-serving to per-100 g, conflicts), `nutrients.js` |
| `scoring/` | `config.js` (**every threshold, score and weight**), `nutrientScores.js`, `allergenPenalty.js`, `personalMatch.js` |
| `ingredients/` | `ingredientParser.js`, `ingredientScore.js` |
| `allergens/` | `allergenData.js` (keyword lists), `allergenDetector.js` |
| `analysis/` | `analyseLabel.js`: the single entry point for scans, saved scans and comparisons |
| `explanations/` | `facts.js` (verified facts sent to Gemini), `ruleBased.js` (explanations without AI) |

Rules: Gemini reads the image and later explains the results. It never calculates or changes a score, a
classification or a penalty. See `docs/SCORING.md`. `ai/package.json` only marks these files as ES modules;
dependencies (such as Sharp) are declared in `server/package.json`.
