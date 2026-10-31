# Expense Quest API contract (v1)

Base URL: `http://localhost:4000`. JSON responses use `{ "success": true, ... }`; errors use `{ "success": false, "error": "..." }`. Dates are preserved from the uploaded CSV. Amounts are non-negative numbers. Categories: Food, Shopping, Travel, Bills, Entertainment, Healthcare, Education, Other.

## Routes

| Method | Route | Request | Success response |
|---|---|---|---|
| GET | `/api/health` | — | `{ success, status: "ok" }` |
| POST | `/api/quests/upload` | multipart form field `file` (.csv) | 201 `{ success, quest, preview }`. `quest` has `id`, `totalTransactions`, `reviewedTransactions`, `status`, `createdAt`, `progress`; each preview row has `id`, `date`, `description`, `amount`, `suggestedCategory`, `finalCategory`, `reviewed`. |
| GET | `/api/quests/:id` | — | `{ success, quest }`; `quest.progress` has `reviewed`, `total`, `percent`, `bossHealth`, `completed`. |
| GET | `/api/quests/:id/transactions` | — | `{ success, transactions: Transaction[] }` |
| GET | `/api/quests/:id/transactions/next` | — | `{ success, transaction: Transaction|null }` |
| PATCH | `/api/transactions/:id` | JSON `{ "category": "Food" }` | `{ success, transaction, player: { xp, level }, quest: { reviewed, total, bossHealth, completed } }`; awards 10 XP once. |
| POST | `/api/transactions/:id/skip` | — | `{ success, transaction, message }`; no review or XP change. |
| POST | `/api/transactions/:id/undo` | — | `{ success, transaction, player, quest }`; only latest review can be undone. |
| GET | `/api/player` | — | `{ success, player: { xp, level, questsCompleted, achievements } }` |
| GET | `/api/quests/:id/report` | — | `{ success, report: { totalExpenses, totalTransactions, categorySpending, highestSpendingCategory, averageTransactionAmount, largestTransaction, monthlySpending } }` |
| GET | `/api/quests/:id/export` | — | Download `expense-quest-:id.csv` with suggested/final categories and review status. |

`Transaction` is `{ id, questId, date, description, amount, suggestedCategory, category, reviewed, reviewedAt }`. Upload accepts `Date` (optional), `Description` or `Merchant`, and `Amount`; common name variations are accepted. Multipart file limit is configured by `MAX_UPLOAD_MB` (default 5). CORS allows the origin(s) in `FRONTEND_ORIGIN` (comma-separated). Duplicate reviews return HTTP 409. Invalid CSV/category/ID returns 400; missing resources return 404.
