# Expense Quest

**Make expense cleanup feel like a quest, then leave with a report you can use.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=20232A)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)

Expense Quest is a CSV-first expense organizer with a short RPG review loop. Import an expense export, check its columns and duplicate warnings, review suggested categories, and export a clean report when you are done. The game reflects real work: reviewing a transaction awards XP once, skipped transactions stay skipped, and achievements come from saved progress. The goal is to make a useful financial task easier to finish—not to bury it under game systems.

## Try it

- **Live app:** [expense-quest-qxabon.v2.appdeploy.ai](https://expense-quest-qxabon.v2.appdeploy.ai/)
- **API health:** [expense-quest-api.onrender.com/api/health](https://expense-quest-api.onrender.com/api/health)
- **Sample CSV:** [public/sample-expenses.csv](./public/sample-expenses.csv)
- **API contract:** [API_CONTRACT.md](./API_CONTRACT.md)

## How it works

1. **Import a CSV.** Preview the file, map unfamiliar columns, and review validation or duplicate warnings before creating a quest.
2. **Review transactions.** Check the suggested category and its explanation, correct it when needed, then review, skip, or undo a review.
3. **Track real progress.** Saved reviews move the quest forward, reduce the boss's health, and award XP once. Skips and category edits do not grant review XP.
4. **Use the results.** Search and filter transactions, set a monthly budget, inspect spending insights, and download the categorized CSV or report.

The app includes a sample expense CSV for a quick walkthrough. Use synthetic data when exploring the public deployment; see the privacy note below before uploading your own file.

## Features

- CSV preview, column mapping, common bank-header recognition, and input validation.
- Duplicate transaction-set detection before import.
- Automatic category suggestions with explanations and editable categories.
- Dungeon review flow with persistent skip state, undo, quest progress, boss health, and server-awarded XP.
- Transaction manager with search, category and review filters, sorting, inline edits, bulk updates, and pagination.
- Reports with category spending, merchant summaries, largest transactions, and monthly spending.
- Monthly budgets stored in MongoDB and calculated from saved debit transactions.
- Categorized CSV export and a print-friendly report.
- Responsive layout with keyboard-accessible controls and reduced-motion support.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React 19, Vite 6, Lucide icons, CSS |
| API | Node.js, Express 5, Multer, `csv-parse` |
| Database | MongoDB Atlas with the official Node.js driver |
| Frontend hosting | AppDeploy |
| API hosting | Render |

## Run locally

### Requirements

- Node.js 22.5 or newer and npm.
- A MongoDB connection for development. Use a separate development database or cluster; do not point local tests at production.

### Setup

```sh
npm ci
```

Copy `.env.example` to `.env` and set `MONGODB_URI` to your development MongoDB connection. For example:

```sh
# macOS, Linux, or Git Bash
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Then start the frontend and API together:

```sh
npm run dev
```

Vite serves the frontend at `http://localhost:5173` and proxies `/api` requests to the Express API at `http://localhost:4000`. The API requires a working `MONGODB_URI` to start. To run only the API, use `npm run dev:api`; to run it without file watching, use `npm start`.

## Configuration

| Variable | Local default | Production use |
| --- | --- | --- |
| `PORT` | `4000` | Set automatically by Render. The server binds to `0.0.0.0`. |
| `MONGODB_URI` | Required | Store the Atlas connection string as a private Render environment variable. Never commit it or put it in frontend code. |
| `MONGODB_DATABASE` | `expense_quest` | Database name used by the API. |
| `FRONTEND_ORIGIN` | Local Vite origins and the live app origin | Comma-separated list of exact browser origins allowed by CORS. In production, use `https://expense-quest-qxabon.v2.appdeploy.ai`. |
| `MAX_UPLOAD_MB` | `5` | Maximum CSV upload size in megabytes. |
| `VITE_API_URL` | API default in the frontend | Optional public API base URL. Defaults to the production API in a production build; it must never contain credentials. |

See [`.env.example`](./.env.example) for the complete local template. `.env` files are ignored by Git.

## Build and checks

```sh
npm run build
npm test
```

The production frontend is written to `dist/`. Tests use Node's built-in test runner. MongoDB API integration tests require `MONGODB_URI`; they create and remove a uniquely named test database, so use a development/test cluster with permission to create and drop databases. Without `MONGODB_URI`, those integration tests are skipped.

## Architecture

The React client sends requests to the Express API. The API validates and categorizes CSV rows, then stores quests, transactions, player progress, and budgets in MongoDB. Reports and progress are calculated from saved records; the browser does not invent XP, spending totals, or achievements.

```text
Browser (React + Vite)
        │  HTTPS / JSON / CSV
        ▼
Express API (Render) ───── MongoDB Atlas
        │
        ├── CSV preview and quest creation
        ├── Transaction review, skip, undo, and edits
        ├── Player progress, achievements, and budgets
        └── Reports and categorized CSV export
```

### Repository layout

```text
.
├── backend/
│   ├── src/                 # Express routes, MongoDB, CSV and report logic
│   └── test/                # API and domain tests
├── frontend/
│   └── src/                 # React app, transaction manager, CSV tools and styles
├── public/
│   └── sample-expenses.csv  # Example file for trying the import flow
├── API_CONTRACT.md          # Routes, payloads, and response shapes
├── render.yaml              # Render Blueprint for the API service
└── vite.config.js           # Vite setup and local API proxy
```

## API overview

The API base URL is `http://localhost:4000` locally and `https://expense-quest-api.onrender.com` in production. Important routes include:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Checks API and MongoDB availability. |
| `POST` | `/api/quests/preview` | Validates and categorizes a CSV without saving a quest. |
| `POST` | `/api/quests/upload` | Creates a quest and stores its transactions. |
| `GET` | `/api/quests/:id/report` | Returns spending summaries and insights. |
| `GET` | `/api/quests/:id/export` | Downloads categorized transaction data as CSV. |
| `GET` / `PUT` | `/api/budgets/:currency` | Reads or updates a monthly budget. |

The complete route list, validation rules, and response formats are in [`API_CONTRACT.md`](./API_CONTRACT.md). Keep that contract in sync when changing API behavior.

## Deploy

### API: Render + MongoDB Atlas

The [Render Blueprint](./render.yaml) creates the Express web service from `backend/`.

1. Create or select an Atlas cluster and a database user with access to the application database.
2. Configure Atlas network access for the Render service.
3. Connect the GitHub repository to Render as a Blueprint and apply `render.yaml`.
4. Set `MONGODB_URI` privately in the Render service environment. Keep `MONGODB_DATABASE` as `expense_quest` unless you intentionally use another database.
5. Set `FRONTEND_ORIGIN` to the exact deployed frontend origin.
6. Verify `https://<your-render-service>.onrender.com/api/health` returns `{"success":true,"status":"ok"}`.

Render uses the commands below from the `backend/` service root. MongoDB Atlas stores application data, so the service does not rely on Render's local filesystem for persistence.

```text
Build:  npm ci --omit=dev
Start:  npm start
Health: /api/health
```

### Frontend: AppDeploy

Build the frontend with `npm run build` and publish the updated frontend through the existing AppDeploy app. The deployed frontend uses the Render API URL by default. If you set `VITE_API_URL`, use the API's public base URL only—never put database credentials or private keys in frontend environment variables.

## Privacy and security

**The current public app is a single-player prototype without user authentication or per-user data isolation. Do not upload real, sensitive, or identifying financial records to the public deployment. Use the provided sample file or synthetic data.** Adding authenticated users and isolating each user's quests and transactions is required before using this as a private finance service.

For local development, keep `.env` and database credentials out of commits. Use a dedicated test database because the integration suite drops its generated test database when it finishes.

## Contributing

Changes are easiest to review when they preserve the documented API contract and keep game rewards tied to real, saved actions. Before opening a pull request, run `npm test` and `npm run build`, update `API_CONTRACT.md` when routes or response shapes change, and avoid including real transaction data in fixtures or screenshots.
