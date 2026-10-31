'use strict';

require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../../.env'),
});

const express = require('express');
const { createHash } = require('node:crypto');
const cors = require('cors');
const multer = require('multer');
const db = require('./db');
const { parseExpenses, monthKeyFromDate } = require('./csv');
const { categories } = require('./categorize');
const { deriveAchievements } = require('./achievements');
const { buildBudgetSummary } = require('./budgets');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024,
    files: 1,
  },
  fileFilter(_req, file, callback) {
    if (
      file.mimetype === 'text/csv' ||
      file.originalname.toLowerCase().endsWith('.csv')
    ) {
      callback(null, true);
    } else {
      callback(
        Object.assign(new Error('Upload a .csv file.'), { status: 400 }),
      );
    }
  },
});

const origin =
  process.env.FRONTEND_ORIGIN ||
  'http://localhost:3000,http://localhost:5173,https://expense-quest-qxabon.v2.appdeploy.ai';

app.use(
  cors({
    origin: origin.split(',').map((value) => value.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);
app.use(express.json({ limit: '32kb' }));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function databaseTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function questView(quest) {
  const reviewed = quest.reviewed_transactions;
  const total = quest.total_transactions;
  return {
    id: quest._id,
    currency: quest.currency || null,
    totalTransactions: total,
    reviewedTransactions: reviewed,
    status: quest.status,
    createdAt: databaseTimestamp(quest.created_at),
    progress: {
      reviewed,
      total,
      percent: total ? Math.round((reviewed / total) * 100) : 100,
      bossHealth: total
        ? Math.max(0, 100 - Math.floor((reviewed / total) * 100))
        : 0,
      completed: quest.status === 'completed',
    },
  };
}

function transactionView(transaction) {
  return {
    id: transaction._id,
    questId: transaction.quest_id,
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amount,
    direction: transaction.direction || 'debit',
    currency: transaction.currency || null,
    suggestedCategory: transaction.suggested_category,
    suggestionReason:
      transaction.suggestion_reason ||
      'This category was suggested by the merchant rules.',
    category: transaction.final_category,
    reviewed: Boolean(transaction.reviewed),
    skipped: Boolean(transaction.skipped),
    reviewedAt: databaseTimestamp(transaction.reviewed_at),
  };
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function roundCurrency(value, currency) {
  let fractionDigits = 2;
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      fractionDigits = new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits;
    } catch {
      fractionDigits = 2;
    }
  }
  const scale = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function importFingerprint(rows) {
  const normalized = rows
    .map((row) =>
      [
        row.date || '',
        String(row.description || '').trim().toLocaleLowerCase(),
        String(Number(row.amount)),
        row.direction || 'debit',
        row.currency || '',
      ].join('\u001f'),
    )
    .sort();
  return createHash('sha256').update(normalized.join('\u001e')).digest('hex');
}

async function getQuest(id, session) {
  return db.quests.findOne({ _id: id }, session ? { session } : undefined);
}

async function playerView(player) {
  const reviewedTransactions = await db.transactions.countDocuments({
    reviewed: true,
  });
  return {
    xp: player.xp,
    level: 1 + Math.floor(player.xp / 100),
    questsCompleted: player.quests_completed,
    achievements: deriveAchievements({
      reviewedTransactions,
      questsCompleted: player.quests_completed,
    }),
  };
}

async function budgetSummary(currency) {
  const month = new Date().toISOString().slice(0, 7);
  const [budget, transactions] = await Promise.all([
    db.budgets.findOne({ _id: currency }),
    db.transactions
      .find({ currency })
      .project({ amount: 1, direction: 1, date: 1 })
      .toArray(),
  ]);
  const summary = buildBudgetSummary({ currency, month, budget, transactions });
  if (summary.budget)
    summary.budget.updatedAt = databaseTimestamp(summary.budget.updatedAt);
  return summary;
}

function validCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  return typeof Intl.supportedValuesOf !== 'function' ||
    Intl.supportedValuesOf('currency').includes(currency)
    ? currency
    : null;
}

app.get('/api/health', async (_req, res) => {
  try {
    await db.ping();
    res.json({ success: true, status: 'ok' });
  } catch {
    res.status(503).json({ success: false, status: 'unavailable' });
  }
});

app.post('/api/quests/preview', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Attach a CSV file using the "file" field.',
    });
  }

  const rows = parseExpenses(req.file.buffer);
  const contentHash = importFingerprint(rows);
  const existingQuest = db.isConnected()
    ? await db.quests.findOne({ content_hash: contentHash })
    : null;
  return res.json({
    success: true,
    duplicateImport: Boolean(existingQuest),
    duplicateQuestId: existingQuest?._id || null,
    preview: rows.map((row) => ({
      date: row.date,
      description: row.description,
      amount: row.amount,
      direction: row.direction || 'debit',
      currency: row.currency || null,
      category: row.imported_category || null,
      suggestedCategory: row.suggested_category,
      suggestionReason: row.suggestion_reason,
    })),
  });
});

app.post('/api/quests/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Attach a CSV file using the "file" field.',
    });
  }

  const rows = parseExpenses(req.file.buffer);
  const contentHash = importFingerprint(rows);
  const result = await db.withTransaction(async (session) => {
    const existingQuest = await db.quests.findOne(
      { content_hash: contentHash },
      { session },
    );
    if (existingQuest) {
      throw new HttpError(
        409,
        `These transactions were already imported in quest ${existingQuest._id}.`,
      );
    }
    const [questId] = await db.reserveIds('quest', 1, session);
    const quest = {
      _id: questId,
      content_hash: contentHash,
      currency: rows[0].currency || null,
      total_transactions: rows.length,
      reviewed_transactions: 0,
      status: 'active',
      created_at: new Date(),
    };
    await db.quests.insertOne(quest, { session });

    const transactionIds = await db.reserveIds(
      'transaction',
      rows.length,
      session,
    );
    const transactions = rows.map((row, index) => ({
      _id: transactionIds[index],
      quest_id: questId,
      date: row.date,
      description: row.description,
      amount: row.amount,
      direction: row.direction || 'debit',
      currency: row.currency || null,
      suggested_category: row.suggested_category,
      suggestion_reason: row.suggestion_reason,
      final_category: row.imported_category || row.suggested_category,
      reviewed: false,
      skipped: false,
      reviewed_at: null,
    }));

    if (transactions.length)
      await db.transactions.insertMany(transactions, { session });

    return {
      quest,
      preview: transactions.map((transaction) => ({
        id: transaction._id,
        date: transaction.date,
        description: transaction.description,
        amount: transaction.amount,
        direction: transaction.direction,
        currency: transaction.currency,
        suggestedCategory: transaction.suggested_category,
        category: transaction.final_category,
        suggestionReason: transaction.suggestion_reason,
        finalCategory: transaction.final_category,
        reviewed: false,
        skipped: false,
      })),
    };
  });

  return res.status(201).json({
    success: true,
    quest: questView(result.quest),
    preview: result.preview,
  });
});

app.get('/api/quests/:id', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });
  return res.json({ success: true, quest: questView(quest) });
});

app.get('/api/quests/:id/transactions', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });

  const transactions = await db.transactions
    .find({ quest_id: id })
    .sort({ _id: 1 })
    .toArray();
  return res.json({
    success: true,
    transactions: transactions.map(transactionView),
  });
});

app.get('/api/quests/:id/transactions/next', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });

  const transaction = await db.transactions.findOne(
    { quest_id: id, reviewed: false, skipped: { $ne: true } },
    { sort: { _id: 1 } },
  );
  return res.json({
    success: true,
    transaction: transaction ? transactionView(transaction) : null,
  });
});

app.patch('/api/transactions/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (!id)
    return res
      .status(400)
      .json({ success: false, error: 'Invalid transaction ID.' });

  const category = req.body?.category;
  if (typeof category !== 'string' || !categories.includes(category)) {
    return res.status(400).json({
      success: false,
      error: `category must be one of: ${categories.join(', ')}.`,
    });
  }

  const result = await db.withTransaction(async (session) => {
    const transaction = await db.transactions.findOne({ _id: id }, { session });
    if (!transaction) throw new HttpError(404, 'Transaction not found.');
    if (transaction.reviewed)
      throw new HttpError(409, 'Transaction has already been reviewed.');

    const quest = await getQuest(transaction.quest_id, session);
    if (!quest) throw new HttpError(404, 'Quest not found.');

    const reviewedAt = new Date();
    const update = await db.transactions.updateOne(
      { _id: id, reviewed: false },
      {
        $set: {
          final_category: category,
          reviewed: true,
          skipped: false,
          reviewed_at: reviewedAt,
        },
      },
      { session },
    );
    if (!update.modifiedCount)
      throw new HttpError(409, 'Transaction has already been reviewed.');

    const reviewedCount = quest.reviewed_transactions + 1;
    const completed =
      reviewedCount === quest.total_transactions &&
      quest.status !== 'completed';
    const questUpdate = { $inc: { reviewed_transactions: 1 } };
    if (completed) questUpdate.$set = { status: 'completed' };
    await db.quests.updateOne({ _id: quest._id }, questUpdate, { session });

    const player = await db.players.findOneAndUpdate(
      { _id: 'player' },
      { $inc: { xp: 10, quests_completed: completed ? 1 : 0 } },
      { returnDocument: 'after', includeResultMetadata: false, session },
    );

    return {
      quest: {
        ...quest,
        reviewed_transactions: reviewedCount,
        status: completed ? 'completed' : quest.status,
      },
      transaction: {
        ...transaction,
        final_category: category,
        reviewed: true,
        reviewed_at: reviewedAt,
      },
      player,
    };
  });

  return res.json({
    success: true,
    transaction: transactionView(result.transaction),
    player: await playerView(result.player),
    quest: {
      reviewed: result.quest.reviewed_transactions,
      total: result.quest.total_transactions,
      bossHealth: questView(result.quest).progress.bossHealth,
      completed: result.quest.status === 'completed',
    },
  });
});

app.patch('/api/transactions/:id/category', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: 'Invalid transaction ID.' });
  }
  const category = req.body?.category;
  if (typeof category !== 'string' || !categories.includes(category)) {
    return res.status(400).json({
      success: false,
      error: `category must be one of: ${categories.join(', ')}.`,
    });
  }
  const transaction = await db.transactions.findOneAndUpdate(
    { _id: id },
    { $set: { final_category: category } },
    { returnDocument: 'after', includeResultMetadata: false },
  );
  if (!transaction) {
    return res
      .status(404)
      .json({ success: false, error: 'Transaction not found.' });
  }
  return res.json({ success: true, transaction: transactionView(transaction) });
});

app.post('/api/transactions/:id/skip', async (req, res) => {
  const id = validId(req.params.id);
  const transaction = id && (await db.transactions.findOne({ _id: id }));
  if (!transaction)
    return res
      .status(404)
      .json({ success: false, error: 'Transaction not found.' });
  if (transaction.reviewed) {
    return res
      .status(409)
      .json({
        success: false,
        error: 'Reviewed transaction cannot be skipped.',
      });
  }
  const updated = await db.transactions.findOneAndUpdate(
    { _id: id, reviewed: false },
    { $set: { skipped: true } },
    { returnDocument: 'after', includeResultMetadata: false },
  );
  if (!updated)
    return res
      .status(409)
      .json({
        success: false,
        error: 'Reviewed transaction cannot be skipped.',
      });
  return res.json({
    success: true,
    transaction: transactionView(updated),
    message: 'Skipped; no XP awarded.',
  });
});

app.post('/api/transactions/:id/unskip', async (req, res) => {
  const id = validId(req.params.id);
  if (!id)
    return res
      .status(400)
      .json({ success: false, error: 'Invalid transaction ID.' });
  const updated = await db.transactions.findOneAndUpdate(
    { _id: id, reviewed: false },
    { $set: { skipped: false } },
    { returnDocument: 'after', includeResultMetadata: false },
  );
  if (!updated) {
    const transaction = await db.transactions.findOne({ _id: id });
    if (!transaction)
      return res
        .status(404)
        .json({ success: false, error: 'Transaction not found.' });
    return res
      .status(409)
      .json({
        success: false,
        error: 'Reviewed transaction cannot be resumed.',
      });
  }
  return res.json({ success: true, transaction: transactionView(updated) });
});

app.post('/api/transactions/:id/undo', async (req, res) => {
  const id = validId(req.params.id);
  if (!id)
    return res
      .status(404)
      .json({ success: false, error: 'Transaction not found.' });

  const result = await db.withTransaction(async (session) => {
    const transaction = await db.transactions.findOne({ _id: id }, { session });
    if (!transaction) throw new HttpError(404, 'Transaction not found.');
    if (!transaction.reviewed)
      throw new HttpError(409, 'Transaction is not reviewed.');

    const latest = await db.transactions
      .find({ quest_id: transaction.quest_id, reviewed: true }, { session })
      .sort({ reviewed_at: -1, _id: -1 })
      .limit(1)
      .next();
    if (latest?._id !== id) {
      throw new HttpError(409, 'Only the most recent review can be undone.');
    }

    const quest = await getQuest(transaction.quest_id, session);
    if (!quest) throw new HttpError(404, 'Quest not found.');

    const wasCompleted = quest.status === 'completed';
    const updatedTransaction = await db.transactions.findOneAndUpdate(
      { _id: id, reviewed: true },
      { $set: { reviewed: false, skipped: false, reviewed_at: null } },
      { returnDocument: 'after', includeResultMetadata: false, session },
    );
    if (!updatedTransaction)
      throw new HttpError(409, 'Transaction is not reviewed.');

    await db.quests.updateOne(
      { _id: quest._id },
      { $inc: { reviewed_transactions: -1 }, $set: { status: 'active' } },
      { session },
    );

    const player = await db.players.findOne({ _id: 'player' }, { session });
    const updatedPlayer = {
      xp: Math.max(0, player.xp - 10),
      quests_completed: Math.max(
        0,
        player.quests_completed - (wasCompleted ? 1 : 0),
      ),
    };
    await db.players.updateOne(
      { _id: 'player' },
      { $set: updatedPlayer },
      { session },
    );

    return {
      quest: {
        ...quest,
        reviewed_transactions: quest.reviewed_transactions - 1,
        status: 'active',
      },
      transaction: updatedTransaction,
      player: updatedPlayer,
    };
  });

  return res.json({
    success: true,
    transaction: transactionView(result.transaction),
    player: await playerView(result.player),
    quest: questView(result.quest),
  });
});

app.get('/api/player', async (_req, res) => {
  const player = await db.players.findOne({ _id: 'player' });
  return res.json({
    success: true,
    player: await playerView(player),
  });
});

app.get('/api/budgets/:currency', async (req, res) => {
  const currency = validCurrency(req.params.currency);
  if (!currency)
    return res.status(400).json({ success: false, error: 'Currency must be a three-letter code.' });
  return res.json({ success: true, ...await budgetSummary(currency) });
});

app.put('/api/budgets/:currency', async (req, res) => {
  const currency = validCurrency(req.params.currency);
  if (!currency)
    return res.status(400).json({ success: false, error: 'Currency must be a three-letter code.' });
  const monthlyAmount = Number(req.body?.monthlyAmount);
  if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0 || monthlyAmount > 1_000_000_000) {
    return res.status(400).json({
      success: false,
      error: 'monthlyAmount must be between 0 and 1,000,000,000.',
    });
  }
  if (monthlyAmount === 0) {
    await db.budgets.deleteOne({ _id: currency });
  } else {
    await db.budgets.updateOne(
      { _id: currency },
      {
        $set: {
          monthly_amount: roundCurrency(monthlyAmount, currency),
          updated_at: new Date(),
        },
      },
      { upsert: true },
    );
  }
  return res.json({ success: true, ...await budgetSummary(currency) });
});

app.get('/api/quests/:id/report', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });

  const transactions = await db.transactions
    .find({ quest_id: id })
    .sort({ _id: 1 })
    .toArray();
  const debitTransactions = transactions.filter(
    (transaction) => transaction.direction !== 'credit',
  );
  const creditTransactions = transactions.filter(
    (transaction) => transaction.direction === 'credit',
  );
  const unroundedTotal = debitTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const unroundedCredits = creditTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const totalExpenses = roundCurrency(unroundedTotal, quest.currency);
  const totalCredits = roundCurrency(unroundedCredits, quest.currency);
  const categoryTotals = new Map();
  const monthlyTotals = new Map();
  const merchantTotals = new Map();

  for (const transaction of debitTransactions) {
    const current = categoryTotals.get(transaction.final_category) || {
      spending: 0,
      count: 0,
    };
    current.spending += transaction.amount;
    current.count += 1;
    categoryTotals.set(transaction.final_category, current);

    const merchantName = String(transaction.description || '').trim();
    const merchantKey = merchantName.toLocaleLowerCase();
    const merchant = merchantTotals.get(merchantKey) || {
      merchant: merchantName,
      spending: 0,
      count: 0,
    };
    merchant.spending += transaction.amount;
    merchant.count += 1;
    merchantTotals.set(merchantKey, merchant);

    const month = monthKeyFromDate(transaction.date);
    if (month)
      monthlyTotals.set(
        month,
        (monthlyTotals.get(month) || 0) + transaction.amount,
      );
  }

  const categorySpending = [...categoryTotals.entries()]
    .map(([category, totals]) => ({
      category,
      spending: roundCurrency(totals.spending, quest.currency),
      count: totals.count,
    }))
    .sort((left, right) => right.spending - left.spending);

  const largest = [...debitTransactions].sort((left, right) => {
    const amountDifference = right.amount - left.amount;
    return amountDifference || left._id - right._id;
  })[0];
  const topTransactions = [...debitTransactions]
    .sort((left, right) => {
      const amountDifference = right.amount - left.amount;
      return amountDifference || left._id - right._id;
    })
    .slice(0, 5)
    .map((transaction) => ({
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.final_category,
      currency: transaction.currency || quest.currency || null,
    }));

  const report = {
    totalExpenses,
    totalDebits: totalExpenses,
    totalCredits,
    netSpend: roundCurrency(unroundedTotal - unroundedCredits, quest.currency),
    currency: quest.currency || null,
    totalTransactions: transactions.length,
    categorySpending,
    topMerchants: [...merchantTotals.values()]
      .sort((left, right) => right.spending - left.spending)
      .slice(0, 5)
      .map((merchant) => ({
        ...merchant,
        spending: roundCurrency(merchant.spending, quest.currency),
      })),
    topTransactions,
    highestSpendingCategory: categorySpending[0]?.category || null,
    averageTransactionAmount: debitTransactions.length
      ? roundCurrency(unroundedTotal / debitTransactions.length, quest.currency)
      : 0,
    largestTransaction: largest
      ? {
          date: largest.date,
          description: largest.description,
          amount: largest.amount,
          currency: largest.currency || quest.currency || null,
        }
      : null,
    monthlySpending: [...monthlyTotals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, spending]) => ({
        month,
        spending: roundCurrency(spending, quest.currency),
      })),
  };

  return res.json({ success: true, report });
});

app.get('/api/quests/:id/export', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });

  const transactions = await db.transactions
    .find({ quest_id: id })
    .sort({ _id: 1 })
    .toArray();
  const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [
    'Date,Description,Amount,Direction,Currency,Suggested Category,Final Category,Reviewed',
    ...transactions.map((transaction) =>
      [
        transaction.date,
        transaction.description,
        transaction.amount,
        transaction.direction || 'debit',
        transaction.currency || quest.currency,
        transaction.suggested_category,
        transaction.final_category,
        transaction.reviewed ? 'true' : 'false',
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ].join('\r\n');

  return res.type('text/csv').attachment(`expense-quest-${id}.csv`).send(csv);
});

app.use((error, _req, res, _next) => {
  const status =
    error.status ||
    (error instanceof multer.MulterError ? 400 : error.code === 11000 ? 409 : 500);
  if (status === 500)
    console.error(`Request failed (${error.name || 'Error'}).`);
  return res.status(status).json({
    success: false,
    error:
      status === 500
        ? 'Internal server error.'
        : error.code === 11000
          ? 'These transactions were already imported.'
          : error.message,
  });
});

async function start() {
  await db.connect();
  const port = Number(process.env.PORT) || 4000;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Expense Quest API listening on 0.0.0.0:${port}`);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}; closing Expense Quest API.`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error(
      `Expense Quest API failed to start (${error.name || 'Error'}). Check MongoDB settings and connectivity.`,
    );
    process.exitCode = 1;
  });
}

module.exports = { app, db, start };
