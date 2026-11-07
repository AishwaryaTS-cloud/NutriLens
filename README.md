# NutriLens

AI-powered food label intelligence platform: "See what's really on the label."
Pure MERN in JavaScript (React + Vite, Node + Express, MongoDB + Mongoose), built to run on free
tiers. See `docs/FREE_TIER.md`.

**Status: Phase 1 (user authentication).** Register, log in, log out and a protected dashboard work.
There is no scanning yet. The landing page still shows live web app, API and database status.

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

## Quick start
See `docs/SETUP.md`.

