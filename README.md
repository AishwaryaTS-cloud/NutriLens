# NutriLens

AI-powered food label intelligence platform: "See what's really on the label."

**Flow:** food label photo → Gemini Vision extraction → backend validation → you review and correct →
deterministic calculations (nutrient levels, ingredient and allergen analysis, Personal Match Score) →
Gemini explanation of the calculated results → save the scan → history, comparison and dashboard.

There is no OCR engine. The image goes straight to the Gemini API from the server (the key never reaches the
browser). Gemini only reads the label and explains results; every number comes from JavaScript in `ai/scoring/`.
If Gemini is unavailable or out of free quota, you can type the values by hand and the analysis still works with
rule-based explanations.

## Structure (follows the project synopsis)
| Path | Purpose |
|---|---|
| `client/` | React + Vite frontend with plain CSS (`src/assets/styles/`) |
| `server/` | Express REST API: `config/ controllers/ middleware/ models/ routes/ services/ utils/` |
| `ai/` | Gemini Vision extraction, validation, scoring, allergen and ingredient analysis, explanations (see `ai/README.md`) |
| `docker/` | Dockerfiles and nginx config |
| `docker-compose.yml` | Local MongoDB and Redis for development |
| `.github/workflows/ci-cd.yml` | CI now, CD in phase 13 |
| `docs/` | Setup, free-tier limits and `SCORING.md` (every threshold and formula) |

## Authentication API
Login uses a JWT stored in an HTTP-only cookie (`nl_token`); JavaScript in the page cannot read it.

| Method and path | Purpose | Auth |
|---|---|---|
| `POST /api/auth/register` | Create an account (name, email, password) and sign in | no |
| `POST /api/auth/login` | Log in with email and password | no |
| `POST /api/auth/logout` | Clear the login cookie | no |
| `GET /api/auth/me` | The current user | yes |

Errors always look like `{ "error": { "code", "message", "details?" } }`. Passwords are hashed with
bcryptjs (12 rounds) and the hash never leaves the server. The Phase 0 health check stays at
`GET /api/v1/health`.

## Profile API
All profile endpoints need a signed-in user, and every request only reads or changes the signed-in
user's own data. Non-GET requests also go through the same-origin check.

| Method and path | Purpose |
|---|---|
| `GET /api/profile` | The saved preferences (`profile`) and the lists the form is built from (`options`) |
| `PUT /api/profile/preferences` | Replace dietary preference, nutrient priorities, allergens and custom allergens |
| `PATCH /api/profile` | Change the display name (`{ name }`) |

What a profile holds (see `server/config/nutrition.js`):
- **Dietary preference:** vegetarian, vegan, eggetarian, pescatarian or no specific preference.
- **Nutrient priorities (optional):** any of sugar, protein, fibre, sodium, fat, saturated fat, carbohydrates, each with a
  goal (lower or higher) and a weight from 1 to 3 (3 matters most).
- **Allergens to avoid:** milk, eggs, peanuts, tree nuts, soy, wheat / gluten, fish, crustaceans / shellfish, sesame, sulphites.
- **Other allergens:** up to 5 free-text entries, 3 to 40 characters (letters, numbers, spaces, hyphens, apostrophes).

Dietary preference and the priorities are stored only. No scoring uses them until the scoring phase defines how.

**Privacy:** allergens and diet are personal data. Profile responses are never cached, nothing from a profile is
written to logs, and users cannot reach each other's profiles.

## Scan API (all routes need login)
| Route | Purpose |
|---|---|
| `GET /api/scans/options` | Upload limits |
| `POST /api/scans/extract` | Multipart field `image` (JPG/PNG/WebP). The server validates it, sends it to Gemini Vision and returns `{ extraction: { status, label, issues, readability, ... } }` |
| `POST /api/scans/analyse` | `{ label }` (the confirmed label). Returns `{ analysis, explanation }`. Nothing is saved. `422 LABEL_INVALID` lists field issues |
| `POST /api/scans` | `{ label, explanation? }` saves a scan. The server recalculates the analysis; client scores are ignored |
| `GET /api/scans` / `GET /api/scans/:id` / `DELETE /api/scans/:id` | History, one scan, delete |
| `GET /api/scans/compare?a=ID&b=ID` | Two saved scans re-scored with the same functions and your current profile |
| `GET /api/scans/summary` | Dashboard statistics |

Gemini errors map to clear codes: `GEMINI_QUOTA_EXCEEDED` (429), `GEMINI_DAILY_LIMIT` (429), `GEMINI_UNAVAILABLE` /
`GEMINI_NOT_CONFIGURED` (503), `GEMINI_TIMEOUT` (504), `GEMINI_BLOCKED` (422), `GEMINI_BAD_RESPONSE` (502).

## Quick start
See `docs/SETUP.md`.

## Security
- Never commit `.env` files, keys, connection strings or user data. `.gitignore` blocks them; only `.env.example` is tracked.
- The API validates its environment at start-up and never prints secret values in errors.

