# Expense Quest

EXPENSE QUEST is a React + Vite frontend with an Express API in `backend/`. The API stores quests, transactions, player XP, and progress in MongoDB.

## Backend on Render

The repository includes a Render Blueprint at [`render.yaml`](./render.yaml). It creates a Node web service from the `backend/` directory and uses Render's free web plan. MongoDB Atlas holds application data, so the API does not need a Render persistent disk.

### Atlas setup

1. Create or select a MongoDB Atlas cluster.
2. Create a database user with read/write access to the `expense_quest` database.
3. Configure Atlas Network Access to allow connections from the Render service's outbound IP ranges.
4. Copy the Atlas driver connection URI. Keep it private; do not add it to this repository or frontend code.

### Deploy steps

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Render, choose **New → Blueprint** and connect this repository.
3. When prompted for `MONGODB_URI`, paste the Atlas connection URI into Render's secret field. For an existing service, set it in the service's Environment settings.
4. Apply the Blueprint. Render runs the build and start commands below.
5. Check `https://<your-service>.onrender.com/api/health`; a healthy response is `{"success":true,"status":"ok"}`.
6. In the deployed frontend, open the connection settings and enter the Render service URL. `FRONTEND_ORIGIN` must match the frontend origin exactly for browser requests to pass CORS.

### Render commands

- Build command: `npm ci --omit=dev`
- Start command: `npm start`
- Health check: `/api/health`

### Environment variables

| Variable | Render value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables production configuration. |
| `MONGODB_URI` | Set privately in Render | Atlas connection URI; never commit this value or put it in frontend code. |
| `MONGODB_DATABASE` | `expense_quest` | Database name. |
| `FRONTEND_ORIGIN` | `https://expense-quest-qxabon.v2.appdeploy.ai` | Exact frontend origin allowed by CORS. |
| `MAX_UPLOAD_MB` | `5` | CSV upload limit. |
| `PORT` | Set automatically by Render | The server listens on this port and binds to `0.0.0.0`. |

Render's filesystem can remain ephemeral because the backend stores its data in Atlas and processes CSV uploads in memory. The backend uses MongoDB transactions for quest uploads, reviews, and undo operations.

## Local development

Copy `.env.example` to `.env` and set `MONGODB_URI` to a development Atlas or local MongoDB connection. Keep `.env` private. From the repository root:

```sh
npm install
npm run dev
```

This runs Vite and the API together. Vite proxies `/api` to `http://localhost:4000`. To run only the API, use `npm run dev:api`; to start it without file watching, use `npm start`.

The backend package and lockfile are in `backend/`. To run its API integration tests, set `MONGODB_URI` to a development/test cluster first. The test suite creates a uniquely named test database and drops it after the run; do not point it at a production database.

## API contract

The existing endpoints and response formats are documented in [`API_CONTRACT.md`](./API_CONTRACT.md).
