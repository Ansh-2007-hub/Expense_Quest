'use strict';

require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../../.env'),
});

const express = require('express');
const { createHash } = require('node:crypto');
const cors = require('cors');
const multer = require('multer');
const db = require('./db');
const { parseExpenses } = require('./csv');
const { categories } = require('./categorize');
const { deriveAchievements } = require('./achievements');
const { buildBudgetSummary } = require('./budgets');
const { buildExpenseCsv } = require('./csvExport');
const { buildQuestReport } = require('./reports');
const { securityHeaders, createAuthRateLimiter } = require('./security');
const {
  SESSION_TTL_MS,
  normalizeEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashSessionToken,
  bearerToken,
  publicUser,
} = require('./auth');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
const MAX_UPLOAD_MB = Math.min(20, Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 5));
const MAX_CSV_ROWS = Math.min(10000, Math.max(100, Number(process.env.MAX_CSV_ROWS) || 5000));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
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
const allowedOrigins = new Set([
  ...origin.split(',').map((value) => value.trim()).filter(Boolean),
  'https://expense-quest-qxabon.v2.appdeploy.ai',
  'https://expense-quest-uz0ijy.v2.appdeploy.ai',
]);

app.use(
  cors({
    origin(requestOrigin, callback) {
      callback(null, !requestOrigin || allowedOrigins.has(requestOrigin));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

function parseUploadedExpenses(buffer) {
  const rows = parseExpenses(buffer);
  if (rows.length > MAX_CSV_ROWS) {
    throw new HttpError(413, `This CSV has ${rows.length} rows. The current limit is ${MAX_CSV_ROWS} rows per quest.`);
  }
  return rows;
}

async function getQuest(id, userId, session) {
  return db.quests.findOne(
    { _id: id, user_id: userId },
    session ? { session } : undefined,
  );
}

async function playerView(player, userId) {
  const reviewedTransactions = await db.transactions.countDocuments({
    user_id: userId,
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

function mongoMonthKey(dateField = '$date') {
  const value = { $ifNull: [dateField, ''] };
  const parts = { $split: [value, '/'] };
  const toInteger = (input) => ({ $convert: { input, to: 'int', onError: null, onNull: null } });
  return {
    $switch: {
      branches: [
        {
          case: { $regexMatch: { input: value, regex: /^\d{4}-\d{1,2}-\d{1,2}/ } },
          then: {
            $let: {
              vars: { isoMonth: { $substrBytes: [value, 0, 7] } },
              in: {
                $let: {
                  vars: { pieces: { $split: ['$$isoMonth', '-'] } },
                  in: {
                    $concat: [
                      { $arrayElemAt: ['$$pieces', 0] },
                      '-',
                      { $cond: [
                        { $eq: [{ $strLenBytes: { $arrayElemAt: ['$$pieces', 1] } }, 1] },
                        { $concat: ['0', { $arrayElemAt: ['$$pieces', 1] }] },
                        { $arrayElemAt: ['$$pieces', 1] },
                      ] },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          case: { $regexMatch: { input: value, regex: /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/ } },
          then: {
            $let: {
              vars: {
                first: toInteger({ $arrayElemAt: [parts, 0] }),
                second: toInteger({ $arrayElemAt: [parts, 1] }),
                year: toInteger({ $arrayElemAt: [parts, 2] }),
              },
              in: {
                $let: {
                  vars: {
                    month: { $cond: [{ $gt: ['$$first', 12] }, '$$second', '$$first'] },
                    yearFull: { $cond: [
                      { $lt: ['$$year', 100] },
                      { $add: ['$$year', { $cond: [{ $lt: ['$$year', 70] }, 2000, 1900] }] },
                      '$$year',
                    ] },
                  },
                  in: {
                    $concat: [
                      { $toString: '$$yearFull' },
                      '-',
                      { $cond: [{ $lt: ['$$month', 10] }, { $concat: ['0', { $toString: '$$month' }] }, { $toString: '$$month' }] },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
      default: {
        $let: {
          vars: { parsed: { $dateFromString: { dateString: value, onError: null, onNull: null } } },
          in: { $cond: [
            { $ne: ['$$parsed', null] },
            { $dateToString: { date: '$$parsed', format: '%Y-%m', timezone: 'UTC' } },
            null,
          ] },
        },
      },
    },
  };
}

async function budgetSummary(currency, userId) {
  const month = new Date().toISOString().slice(0, 7);
  const budgetId = `${userId}:${currency}`;
  const [budget, spending] = await Promise.all([
    db.budgets.findOne({ _id: budgetId, user_id: userId, currency }),
    db.transactions
      .aggregate([
        { $match: { user_id: userId, currency, direction: { $ne: 'credit' } } },
        { $set: { month_key: mongoMonthKey() } },
        { $match: { month_key: month } },
        { $group: { _id: null, spending: { $sum: '$amount' } } },
      ])
      .next(),
  ]);
  const summary = buildBudgetSummary({ currency, month, budget: budget ? { ...budget, _id: currency } : null, currentMonthSpending: spending?.spending || 0 });
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

const authRateLimit = createAuthRateLimiter();

async function issueSession(user, res, status = 200) {
  const token = createSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const userId = String(user._id);
  await db.sessions.insertOne({
    token_hash: hashSessionToken(token),
    user_id: userId,
    created_at: now,
    expires_at: expiresAt,
  });
  await db.players.updateOne(
    { _id: userId },
    { $setOnInsert: { xp: 0, quests_completed: 0 } },
    { upsert: true },
  );
  return res.status(status).json({ success: true, token, user: publicUser(user) });
}

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = validatePassword(req.body?.password);
  if (await db.users.findOne({ email })) {
    throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  }
  const user = {
    email,
    password_hash: await hashPassword(password),
    created_at: new Date(),
  };
  const inserted = await db.users.insertOne(user);
  user._id = inserted.insertedId;
  return issueSession(user, res, 201);
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = validatePassword(req.body?.password);
  const user = await db.users.findOne({ email });
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  return issueSession(user, res);
});

app.post('/api/auth/logout', async (req, res) => {
  const token = bearerToken(req);
  if (token) await db.sessions.deleteOne({ token_hash: hashSessionToken(token) });
  return res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ success: false, error: 'Sign in to continue.' });
  const session = await db.sessions.findOne({ token_hash: hashSessionToken(token), expires_at: { $gt: new Date() } });
  if (!session) return res.status(401).json({ success: false, error: 'Your session has expired. Sign in again.' });
  const user = await db.users.findOne({ _id: new (require('mongodb').ObjectId)(session.user_id) });
  if (!user) return res.status(401).json({ success: false, error: 'Your account could not be found. Sign in again.' });
  return res.json({ success: true, user: publicUser(user) });
});

app.use('/api', async (req, res, next) => {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ success: false, error: 'Sign in to continue.' });
  const session = await db.sessions.findOne({ token_hash: hashSessionToken(token), expires_at: { $gt: new Date() } });
  if (!session) return res.status(401).json({ success: false, error: 'Your session has expired. Sign in again.' });
  const ObjectId = require('mongodb').ObjectId;
  const user = await db.users.findOne({ _id: ObjectId.isValid(session.user_id) ? new ObjectId(session.user_id) : null });
  if (!user) return res.status(401).json({ success: false, error: 'Account is unavailable. Sign in again.' });
  req.user = { id: String(user._id), email: user.email };
  return next();
});

app.post('/api/quests/preview', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Attach a CSV file using the "file" field.',
    });
  }

  const rows = parseUploadedExpenses(req.file.buffer);
  const contentHash = importFingerprint(rows);
  const existingQuest = db.isConnected()
    ? await db.quests.findOne({ user_id: req.user.id, content_hash: contentHash })
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

  const rows = parseUploadedExpenses(req.file.buffer);
  const contentHash = importFingerprint(rows);
  const result = await db.withTransaction(async (session) => {
    const existingQuest = await db.quests.findOne(
      { user_id: req.user.id, content_hash: contentHash },
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
      user_id: req.user.id,
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
      user_id: req.user.id,
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
  const quest = id && (await getQuest(id, req.user.id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });
  return res.json({ success: true, quest: questView(quest) });
});

app.get('/api/quests/:id/transactions', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id, req.user.id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });

  const query = db.transactions.find({ user_id: req.user.id, quest_id: id }).sort({ _id: 1 });
  const requestedPage = Number.parseInt(req.query.page, 10);
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const paginated = Number.isSafeInteger(requestedPage) || Number.isSafeInteger(requestedLimit);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
  if (paginated) query.skip((page - 1) * limit).limit(limit);
  const [transactions, total] = await Promise.all([
    query.toArray(),
    paginated ? db.transactions.countDocuments({ user_id: req.user.id, quest_id: id }) : Promise.resolve(null),
  ]);
  return res.json({
    success: true,
    transactions: transactions.map(transactionView),
    ...(paginated ? { pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } : {}),
  });
});

app.get('/api/quests/:id/transactions/next', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id, req.user.id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });

  const transaction = await db.transactions.findOne(
    { user_id: req.user.id, quest_id: id, reviewed: false, skipped: { $ne: true } },
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
    const transaction = await db.transactions.findOne({ _id: id, user_id: req.user.id }, { session });
    if (!transaction) throw new HttpError(404, 'Transaction not found.');
    if (transaction.reviewed)
      throw new HttpError(409, 'Transaction has already been reviewed.');

    const quest = await getQuest(transaction.quest_id, req.user.id, session);
    if (!quest) throw new HttpError(404, 'Quest not found.');

    const reviewedAt = new Date();
    const update = await db.transactions.updateOne(
      { _id: id, user_id: req.user.id, reviewed: false },
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
    await db.quests.updateOne({ _id: quest._id, user_id: req.user.id }, questUpdate, { session });

    const player = await db.players.findOneAndUpdate(
      { _id: req.user.id },
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
    player: await playerView(result.player, req.user.id),
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
    { _id: id, user_id: req.user.id },
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

app.patch('/api/transactions/categories/bulk', async (req, res) => {
  const transactionIds = req.body?.transactionIds;
  const category = req.body?.category;
  if (!Array.isArray(transactionIds) || transactionIds.length < 1 || transactionIds.length > 100) {
    return res.status(400).json({ success: false, error: 'transactionIds must contain 1 to 100 transaction IDs.' });
  }
  const ids = transactionIds.map(validId);
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ success: false, error: 'transactionIds must be unique valid transaction IDs.' });
  }
  if (typeof category !== 'string' || !categories.includes(category)) {
    return res.status(400).json({ success: false, error: `category must be one of: ${categories.join(', ')}.` });
  }

  await db.transactions.updateMany(
    { _id: { $in: ids }, user_id: req.user.id },
    { $set: { final_category: category } },
  );
  const transactions = await db.transactions
    .find({ _id: { $in: ids }, user_id: req.user.id })
    .toArray();
  const orderedTransactions = new Map(transactions.map((transaction) => [transaction._id, transaction]));
  return res.json({
    success: true,
    transactions: ids.flatMap((id) => {
      const transaction = orderedTransactions.get(id);
      return transaction ? [transactionView(transaction)] : [];
    }),
  });
});

app.post('/api/transactions/:id/skip', async (req, res) => {
  const id = validId(req.params.id);
  const transaction = id && (await db.transactions.findOne({ _id: id, user_id: req.user.id }));
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
    { _id: id, user_id: req.user.id, reviewed: false },
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
    { _id: id, user_id: req.user.id, reviewed: false },
    { $set: { skipped: false } },
    { returnDocument: 'after', includeResultMetadata: false },
  );
  if (!updated) {
    const transaction = await db.transactions.findOne({ _id: id, user_id: req.user.id });
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
    const transaction = await db.transactions.findOne({ _id: id, user_id: req.user.id }, { session });
    if (!transaction) throw new HttpError(404, 'Transaction not found.');
    if (!transaction.reviewed)
      throw new HttpError(409, 'Transaction is not reviewed.');

    const latest = await db.transactions
      .find({ user_id: req.user.id, quest_id: transaction.quest_id, reviewed: true }, { session })
      .sort({ reviewed_at: -1, _id: -1 })
      .limit(1)
      .next();
    if (latest?._id !== id) {
      throw new HttpError(409, 'Only the most recent review can be undone.');
    }

    const quest = await getQuest(transaction.quest_id, req.user.id, session);
    if (!quest) throw new HttpError(404, 'Quest not found.');

    const wasCompleted = quest.status === 'completed';
    const updatedTransaction = await db.transactions.findOneAndUpdate(
      { _id: id, user_id: req.user.id, reviewed: true },
      { $set: { reviewed: false, skipped: false, reviewed_at: null } },
      { returnDocument: 'after', includeResultMetadata: false, session },
    );
    if (!updatedTransaction)
      throw new HttpError(409, 'Transaction is not reviewed.');

    await db.quests.updateOne(
      { _id: quest._id, user_id: req.user.id },
      { $inc: { reviewed_transactions: -1 }, $set: { status: 'active' } },
      { session },
    );

    const player = await db.players.findOne({ _id: req.user.id }, { session });
    const updatedPlayer = {
      xp: Math.max(0, player.xp - 10),
      quests_completed: Math.max(
        0,
        player.quests_completed - (wasCompleted ? 1 : 0),
      ),
    };
    await db.players.updateOne(
      { _id: req.user.id },
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
    player: await playerView(result.player, req.user.id),
    quest: questView(result.quest),
  });
});

app.get('/api/player', async (req, res) => {
  const player = await db.players.findOne({ _id: req.user.id });
  return res.json({
    success: true,
    player: await playerView(player, req.user.id),
  });
});

app.get('/api/budgets/:currency', async (req, res) => {
  const currency = validCurrency(req.params.currency);
  if (!currency)
    return res.status(400).json({ success: false, error: 'Currency must be a three-letter code.' });
  return res.json({ success: true, ...await budgetSummary(currency, req.user.id) });
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
    await db.budgets.deleteOne({ _id: `${req.user.id}:${currency}`, user_id: req.user.id });
  } else {
    await db.budgets.updateOne(
      { _id: `${req.user.id}:${currency}`, user_id: req.user.id },
      {
        $set: {
          currency,
          user_id: req.user.id,
          monthly_amount: roundCurrency(monthlyAmount, currency),
          updated_at: new Date(),
        },
      },
      { upsert: true },
    );
  }
  return res.json({ success: true, ...await budgetSummary(currency, req.user.id) });
});

app.get('/api/quests/:id/report', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id, req.user.id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });

  const report = await buildQuestReport(db.transactions, { userId: req.user.id, questId: id, currency: quest.currency });
  return res.json({ success: true, report });

});

app.get('/api/quests/:id/export', async (req, res) => {
  const id = validId(req.params.id);
  const quest = id && (await getQuest(id, req.user.id));
  if (!quest)
    return res.status(404).json({ success: false, error: 'Quest not found.' });

  const transactions = await db.transactions
    .find({ user_id: req.user.id, quest_id: id })
    .sort({ _id: 1 })
    .limit(MAX_CSV_ROWS)
    .toArray();
  const csv = buildExpenseCsv(transactions, quest.currency);

  return res.type('text/csv').attachment(`expense-quest-${id}.csv`).send(csv);
});

app.use((error, _req, res, _next) => {
  const status =
    error.status ||
    (error instanceof multer.MulterError ? 400 : error.code === 11000 ? 409 : 500);
  if (status === 500) {
    const detail = String(error.message || '').replace(/[\r\n]/g, ' ').slice(0, 240);
    console.error(`Request failed (${error.name || 'Error'}): ${detail}`);
  }
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

  let shuttingDown = false;
  let databaseClosing;
  const closeDatabase = () => {
    databaseClosing ||= db.close();
    return databaseClosing;
  };
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; closing Expense Quest API.`);
    const forceClose = setTimeout(() => {
      console.error('Graceful shutdown deadline reached; closing remaining connections.');
      server.closeAllConnections?.();
      closeDatabase().finally(() => { process.exitCode = 1; });
    }, 15_000);
    forceClose.unref();
    server.close(async (error) => {
      clearTimeout(forceClose);
      try {
        await closeDatabase();
        if (error) process.exitCode = 1;
      } catch (closeError) {
        console.error(`MongoDB shutdown failed (${closeError.name || 'Error'}).`);
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections?.();
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
