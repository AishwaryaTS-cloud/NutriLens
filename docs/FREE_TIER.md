# NutriLens zero-cost plan

NutriLens must run for **$0, with no credit card, no paid API and no automatic billing.**
This file covers every technology in the synopsis: what is free, what needs an account, what has
limits, and the fallback if a limit is reached. Nothing from the synopsis is removed; where a
technology cannot be guaranteed free, a fallback is listed and needs your approval.

> **Verification status.** Figures were gathered on 6 Nov 2026 from vendor documentation and
> third-party summaries. Free tiers change often, so confirm on the vendor's own page before relying
> on a number. Items marked *(unverified)* were not checked against the vendor's own documentation.

## Free, no account (libraries and tools)
React, Vite, React Router, Axios, Recharts, Node.js, Express, Multer, jsonwebtoken, bcryptjs, Sharp,
Mongoose, LangGraph (the open-source JavaScript library), BullMQ (the library), Git,
GitHub Actions on a **public** repository. Docker Compose is free to run locally (check Docker
Desktop's licence terms for your situation; Docker Engine on Linux is free).

## Free tier, account required, no card

| Service | Role | Limits | If the limit is hit |
|---|---|---|---|
| MongoDB Atlas free cluster ("M0") | Database, and Atlas Vector Search for RAG | 512 MB storage; 100 operations/second; one free cluster per project; only 3 search/vector indexes; no uptime guarantee | Writes fail when storage is full. Keep documents compact, cap scans per user, and use local MongoDB (`docker-compose.yml`) as the fallback. **Do not enable backups** (reported as a paid preview on free clusters). |
| Google Gemini API | Explanations, RAG fallback, embeddings *(embeddings tier unverified)* | Small per-model quotas that change often and are shown only in your AI Studio account; free-tier content may be used by Google to improve its products and reviewed by humans | Calls are skipped; results fall back to rules-based text and knowledge-base facts. Show users a notice before any image or text is sent. **Never enable billing on the Google project.** |
| Upstash Redis (free) | Redis for BullMQ and caching | 256 MB; 500K commands/month; 1 database | **BullMQ polls constantly, so an always-on worker can exhaust the monthly command quota.** See fallback below. |
| GitHub (public repo) | Source, Actions | Free for public repositories | Jobs stop at limits. |

## Cannot be guaranteed free (fallbacks proposed)

- **Redis + BullMQ in production.** Local Redis through `docker-compose.yml` costs nothing and has
  no limits. For a hosted demo, the BullMQ code is kept and a documented in-process fallback runs
  jobs without Redis when `REDIS_URL` is not set. *Needs your approval.*
- **AWS (ECR/ECS).** Most sources say a card is required, even for the free tier; one October 2026
  report describes a new card-free sign-up with a small credit *(unverified)*. ECS is not free beyond
  credits. The Docker and AWS files stay in the repository as "deployment-ready" (as the report
  already says), and the demo runs on Docker Compose locally or on a free host. *Needs your approval.*
- **Google Cloud Vision / any OCR engine.** There is no OCR engine in NutriLens. Labels are read by Gemini
  Vision through the Gemini API key only. Google Cloud Vision needs a billing account, so it is not used.
- **Free hosting outside the synopsis (Render, Cloudflare Pages).** Both were discussed earlier as
  free options. They are not in the synopsis, so they are used only if you approve them.
  Render's free web service has 512 MB RAM, 0.1 CPU and sleeps after 15 minutes idle; Sharp image
  preparation may be slow there, and that is benchmarked before relying on it.

## Gemini Vision (label reading and explanations)
- **One request per label read, one per explanation.** Each scan uses at most two Gemini requests. Free-tier
  limits are small, change often and are shown only in your AI Studio account. *They could not be verified
  while this code was written*, so check the current limits for the model in `GEMINI_MODEL`.
- **Never enable billing** on the Google project. When the free quota is used up, Gemini answers with a
  rate-limit error. NutriLens then shows a clear message, lets you type the label values by hand, and still
  gives the full deterministic analysis with rule-based explanations.
- `GEMINI_DAILY_LIMIT` is an optional cap inside this server so it stops before the free quota does.
- **Privacy.** Free-tier content may be used by Google to improve its products. The Scan page tells users the
  image is sent to Gemini; do not upload photos of people or personal documents.
- Sharp and Multer are free and run locally. No language data or CDN download is needed any more.

## Rules the project follows
1. No paid service is required for any core feature.
2. No service that needs a credit card at sign-up.
3. Every free-tier limit has a documented fallback.
4. No automatic provider switching, and no silent move to a paid service.
5. The app must keep working without any AI key.
6. Never add a card or billing account to an AI or cloud account used with NutriLens.
