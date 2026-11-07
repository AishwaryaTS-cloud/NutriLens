# Setup (Phase 0)

Phase 0 needs Node.js and a MongoDB database. Nothing costs money.

## 1. Prerequisites
- Node.js 20.11 or newer (22 recommended) and npm.
- A MongoDB database: **local** (Docker Compose, below), or the **MongoDB Atlas free cluster**.

## 2. Database option A: local MongoDB with Docker (free)
```bash
docker compose up -d mongo
```
The default `MONGODB_URI` in `.env.example` already points at it. It listens only on your own machine.

## 3. Database option B: MongoDB Atlas free cluster
1. Create an account at cloud.mongodb.com. No card is requested for the free cluster.
2. Create a **free** cluster in a nearby region.
3. Database Access: create a database user with a strong password.
4. Network Access: add your current IP address.
5. Connect, choose "Drivers", copy the connection string and replace the password placeholder.
6. Put it in `.env` as `MONGODB_URI=...`. The file is git-ignored. Never commit it or paste it in an issue.
7. Do **not** enable backups or any paid add-on.

The API also starts without a database (it reports "degraded"), so you can skip this at first.

## 4. Install and run
```bash
npm install
cp .env.example .env        # then edit MONGODB_URI if you use Atlas
npm run dev
```
- Web app: http://localhost:5173
- API health check: http://localhost:4000/api/v1/health

Commit the generated `package-lock.json` (CI uses `npm ci`).

## 5. Tests and build
```bash
npm test
npm run build
```

Redis, Gemini keys and deployment steps are added in the phases
that first need them.
