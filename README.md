# NutriLens

AI-powered food label intelligence platform: "See what's really on the label."
Pure MERN in JavaScript (React + Vite, Node + Express, MongoDB + Mongoose), built to run on free
tiers. See `docs/FREE_TIER.md`.

**Status: Phase 0 (foundation).** No sign-in or scanning yet. The landing page checks that the web
app, API and database are connected.

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

## Quick start
See `docs/SETUP.md`.

## Security
- Never commit `.env` files, keys, connection strings or user data. `.gitignore` blocks them; only `.env.example` is tracked.
- The API validates its environment at start-up and never prints secret values in errors.
