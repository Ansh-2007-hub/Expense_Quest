'use strict';

const { MongoClient } = require('mongodb');

let client;
let database;

function getDatabase() {
  if (!database) throw new Error('MongoDB is not connected.');
  return database;
}

function getCollection(name) {
  return getDatabase().collection(name);
}

async function connect() {
  if (database) return database;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE || 'expense_quest');
    await client.db('admin').command({ ping: 1 });

    const quests = database.collection('quests');
    const oldIndexes = await quests.indexes();
    if (oldIndexes.some((index) => index.name === 'quest_content_hash_unique')) {
      await quests.dropIndex('quest_content_hash_unique');
    }

    await Promise.all([
      database.collection('users').createIndex({ email: 1 }, { unique: true, name: 'user_email_unique' }),
      database.collection('sessions').createIndex({ token_hash: 1 }, { unique: true, name: 'session_token_unique' }),
      database.collection('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'session_expiry_ttl' }),
      database.collection('transactions').createIndex({ user_id: 1, quest_id: 1, _id: 1 }),
      database.collection('transactions').createIndex({ user_id: 1, quest_id: 1, reviewed: 1, _id: 1 }),
      database.collection('transactions').createIndex({ user_id: 1, quest_id: 1, final_category: 1 }),
      database.collection('transactions').createIndex({ user_id: 1, quest_id: 1, reviewed: 1, reviewed_at: -1, _id: -1 }),
      database.collection('transactions').createIndex({ user_id: 1, currency: 1, date: 1 }),
      quests.createIndex({ user_id: 1, status: 1, created_at: -1 }),
      quests.createIndex({ user_id: 1, content_hash: 1 }, { unique: true, sparse: true, name: 'user_quest_content_hash_unique' }),
    ]);

    return database;
  } catch (error) {
    await close();
    throw error;
  }
}

async function close() {
  const currentClient = client;
  client = undefined;
  database = undefined;
  if (currentClient) await currentClient.close();
}

async function ping() {
  getDatabase();
  await client.db('admin').command({ ping: 1 });
}

async function withTransaction(work) {
  if (!client) throw new Error('MongoDB is not connected.');
  const session = client.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

async function reserveIds(counterName, count, session) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError('ID reservation count must be a non-negative safe integer.');
  }
  if (count === 0) return [];

  const counter = await getCollection('counters').findOneAndUpdate(
    { _id: counterName },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false, session },
  );
  if (!counter) throw new Error(`Unable to reserve ${counterName} identifiers.`);

  const firstId = counter.seq - count + 1;
  return Array.from({ length: count }, (_, index) => firstId + index);
}

async function dropDatabase() {
  await getDatabase().dropDatabase();
}

const db = {
  connect,
  close,
  ping,
  withTransaction,
  reserveIds,
  dropDatabase,
  isConnected: () => Boolean(database),
};

for (const name of ['budgets', 'counters', 'players', 'quests', 'sessions', 'transactions', 'users']) {
  Object.defineProperty(db, name, { enumerable: true, get: () => getCollection(name) });
}

module.exports = db;
