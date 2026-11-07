# NutriLens

AI-powered food label intelligence platform: "See what's really on the label."
Pure MERN in JavaScript (React + Vite, Node + Express, MongoDB + Mongoose), built to run on free
tiers. See `docs/FREE_TIER.md`.

**Status: Phase 2 (profile and personalization).** Register, log in, log out, a protected dashboard and a
preferences page (dietary preference, nutrient priorities, allergens, display name) work. There is no scanning yet. The landing page still shows live web app, API and database status.

## Structure (follows the project synopsis)
| Path | Purpose |
|---|---|
| `client/` | React + Vite frontend with plain CSS (`src/assets/styles/`) |
| `server/` | Express REST API: `config/ controllers/ middleware/ models/ routes/ services/ utils/` |
| `ai/` | OCR and label-analysis pipeline (Sharp, Tesseract.js, parsers, scoring, RAG, workflow). Filled in during phases 3-10. |
| `docker/` | Dockerfiles and nginx config (phases 11-13) |
| `docker-compose.yml` | Local MongoDB and Redis for development |
| `.github/workflows/ci-cd.yml` | CI now, CD in phase 13 |
| `docs/` | Free-tier limits and setup |

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

## Quick start
See `docs/SETUP.md`.

## Security
- Never commit `.env` files, keys, connection strings or user data. `.gitignore` blocks them; only `.env.example` is tracked.
- The API validates its environment at start-up and never prints secret values in errors.
