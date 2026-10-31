# Expense Quest API contract (v1)

Base URL: `http://localhost:4000`. JSON responses use `{ "success": true, ... }`; errors use `{ "success": false, "error": "..." }`. Dates are preserved from the uploaded CSV. Amounts are non-negative magnitudes; `direction` is `debit` or `credit`. Currency is an optional ISO 4217 code for legacy clients and is set by the current frontend before import. Categories: Food, Shopping, Travel, Bills, Entertainment, Healthcare, Education, Other.

## Routes

| Method | Route | Request | Success response |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{ success, status: "ok" }` |
| POST | `/api/auth/register` | JSON `{ "email": "...", "password": "10+ characters" }` | 201 `{ success, token, user: { id, email, createdAt } }` |
| POST | `/api/auth/login` | JSON `{ "email": "...", "password": "..." }` | `{ success, token, user }` |
| GET | `/api/auth/me` | Bearer session token | `{ success, user }` |
| POST | `/api/auth/logout` | Bearer session token | `{ success }`; revokes the session. |
| POST | `/api/quests/preview` | Bearer token and multipart field `file` (.csv) | `{ success, duplicateImport, duplicateQuestId, preview: [{ date, description, amount, direction, currency, category, suggestedCategory, suggestionReason }] }`; validates and categorizes without creating a quest. Duplicate detection is scoped to the account. |
| POST | `/api/quests/upload` | multipart form field `file` (.csv) | 201 `{ success, quest, preview }`. `quest` has `id`, `currency`, `totalTransactions`, `reviewedTransactions`, `status`, `createdAt`, `progress`; each preview row has `id`, `date`, `description`, `amount`, `direction`, `currency`, `category`, `suggestedCategory`, `finalCategory`, `reviewed`. An exact duplicate import returns 409. |
| GET | `/api/quests/:id` | — | `{ success, quest }`; `quest.progress` has `reviewed`, `total`, `percent`, `bossHealth`, `completed`. |
| GET | `/api/quests/:id/transactions` | Optional `page` and `limit` query parameters | `{ success, transactions: Transaction[] }`; pagination requests also return `{ page, limit, total, totalPages }`. |
| GET | `/api/quests/:id/transactions/next` | — | `{ success, transaction: Transaction | null }` |
| PATCH | `/api/transactions/:id` | JSON `{ "category": "Food" }` | `{ success, transaction, player: { xp, level, questsCompleted, achievements }, quest: { reviewed, total, bossHealth, completed } }`; awards 10 XP once and returns server-derived achievements. |
| PATCH | `/api/transactions/:id/category` | JSON `{ "category": "Food" }` | `{ success, transaction }`; corrects a category without reviewing the row or changing XP. |
| POST | `/api/transactions/:id/skip` | — | `{ success, transaction, message }`; persists the skipped state without review or XP change. |
| POST | `/api/transactions/:id/unskip` | — | `{ success, transaction }`; returns a skipped row to the review queue. |
| POST | `/api/transactions/:id/undo` | — | `{ success, transaction, player, quest }`; only latest review can be undone. |
| GET | `/api/player` | — | `{ success, player: { xp, level, questsCompleted, achievements } }` |
| GET | `/api/budgets/:currency` | — | `{ success, currency, month, budget, currentMonthSpending, remaining, percentUsed, nearLimit, overBudget }`; monthly spending includes saved debit transactions in that currency. |
| PUT | `/api/budgets/:currency` | JSON `{ "monthlyAmount": 500 }`; use zero to clear | `{ success, currency, month, budget, currentMonthSpending, remaining, percentUsed, nearLimit, overBudget }`; the monthly amount is stored in MongoDB. |
| GET | `/api/quests/:id/report` | — | `{ success, report: { totalExpenses, totalDebits, totalCredits, netSpend, currency, totalTransactions, categorySpending, topMerchants, topTransactions, highestSpendingCategory, averageTransactionAmount, largestTransaction, monthlySpending } }`; report spending insights include debit transactions. |
| GET | `/api/quests/:id/export` | — | Download `expense-quest-:id.csv` with direction, currency, suggested/final categories, and review status. |

`Transaction` is `{ id, questId, date, description, amount, direction, currency, suggestedCategory, suggestionReason, category, reviewed, skipped, reviewedAt }`. Every route except health and account creation/login requires a bearer session; records are scoped by `user_id`. Upload accepts `Description`, `Merchant`, or `Narration` plus `Amount`, `Debit`, or `Credit`; `Date`, `Currency`, `Direction`, and `Category` are optional. Common header variations are accepted. A quest contains one currency. Multipart file size is configured by `MAX_UPLOAD_MB` (default 5), and each quest is capped by `MAX_CSV_ROWS` (default 5,000; maximum 10,000). Transactions can be paged with `page` and `limit` (limit capped at 100); omitting both preserves the original full-list response. CSV exports prefix spreadsheet formula leaders in untrusted cells and quote delimiters. CORS permits `Authorization`. Duplicate reviews and exact duplicate imports return HTTP 409. Invalid input returns 400; missing resources return 404. Category corrections do not award XP. Skips persist in MongoDB. Achievements are derived by the server from reviewed transaction and completed quest counts.
