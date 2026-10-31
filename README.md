# EXPENSE QUEST

EXPENSE QUEST is a React + Vite frontend with an Express API in `backend/`. The API stores uploaded transactions, quest progress, and player XP in SQLite.

## Backend on Render

The repository includes a Render Blueprint at [`render.yaml`](./render.yaml). It creates a Node web service with the repository root directory set to `backend`, uses Node `24.22.1` from `backend/.node-version`, and attaches a persistent 1 GB disk at `/var/data` for the SQLite database.

### Deploy steps

1. Push this repository and `render.yaml` to your Git provider.
2. In Render, choose **New → Blueprint**, connect the repository, and review the `expense-quest-api` service.
3. Keep the `starter` plan selected. The persistent disk configured in the Blueprint requires a paid web service plan; do not switch this SQLite service to an ephemeral/free plan.
4. Apply the Blueprint and deploy. Render runs the build and start commands below.
5. When the service is live, check `https://<your-service>.onrender.com/api/health`; it should return `{"success":true,"status":"ok"}`.
6. In the deployed frontend, open the connection settings and enter the Render service URL. `FRONTEND_ORIGIN` in Render must exactly match the frontend origin so browser requests pass CORS.

### Render commands

- Build command: `npm ci --omit=dev`
- Start command: `npm start`
- Health check: `/api/health`

### Environment variables

| Variable | Render value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables production configuration checks. |
| `DATABASE_PATH` | `/var/data/expense-quest.sqlite` | Must stay under the attached persistent disk mount. The server refuses a relative SQLite path in production. |
| `FRONTEND_ORIGIN` | `https://expense-quest-qxabon.v2.appdeploy.ai` | Exact frontend origin allowed by CORS. |
| `MAX_UPLOAD_MB` | `5` | CSV upload limit. |
| `PORT` | Set automatically by Render | The server listens on this port and binds to `0.0.0.0`. Do not hardcode it in Render. |

The disk is essential: Render's ordinary service filesystem is ephemeral. Only `/var/data` is persistent in this setup, and the SQLite database plus its WAL files are written there. A disk-backed service is single-instance and has deploy downtime; for multiple instances, higher write concurrency, or a more scalable production setup, migrate to Render Postgres instead of sharing SQLite.

There are no API secrets in the frontend. This backend currently has no secret-bearing integrations, so no secret environment variable is required.

## Local development

From the repository root:

```sh
npm install
npm run dev
```

This runs Vite and the API together. Vite proxies `/api` to `http://localhost:4000`. To run only the API, use `npm run dev:api`; to start it without file watching, use `npm start`:

```sh
npm run dev:api
```

For local configuration, copy `.env.example` to `.env` in the repository root. By default, SQLite is created at `./data/expense-quest.sqlite`. Do not use that relative local path on Render; the Blueprint sets the persistent absolute path. The isolated backend package and lockfile are in `backend/` for Render's configured root directory.

## API and tests

The existing endpoints and response formats are documented in [`API_CONTRACT.md`](./API_CONTRACT.md). Run the backend integration tests from the repository root with `npm test`, or from `backend/` with `npm test`.
