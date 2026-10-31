'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env') });

const hasMongoUri = Boolean(process.env.MONGODB_URI);
if (hasMongoUri) {
  process.env.MONGODB_DATABASE = `expense_quest_test_${randomUUID().replaceAll('-', '')}`;
}

const { app, db } = require('../src/server');

describe('Expense Quest API with MongoDB', {
  skip: hasMongoUri ? false : 'Set MONGODB_URI to run the MongoDB integration tests.',
}, () => {
  let server;
  let base;
  let questId;
  let transactionId;

  before(async () => {
    await db.connect();
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (hasMongoUri) {
      await db.dropDatabase();
      await db.close();
    }
  });

  async function json(url, options) {
    const response = await fetch(base + url, options);
    return { status: response.status, data: await response.json() };
  }

  test('health endpoint is live', async () => {
    const response = await json('/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'ok');
  });

  test('upload validates and categorizes actual CSV rows', async () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([
        'Date,Merchant,Amount\n2026-02-01,Swiggy dinner,420.50\n2026-02-02,Metro card,300\n',
      ], { type: 'text/csv' }),
      'expenses.csv',
    );

    const response = await fetch(base + '/api/quests/upload', { method: 'POST', body: form });
    const data = await response.json();
    assert.equal(response.status, 201);
    assert.equal(data.quest.totalTransactions, 2);
    assert.equal(data.preview[0].suggestedCategory, 'Food');
    assert.equal(data.preview[1].suggestedCategory, 'Travel');
    questId = data.quest.id;
    transactionId = data.preview[0].id;
  });

  test('rejects malformed expense CSV', async () => {
    const form = new FormData();
    form.append('file', new Blob(['Date,Amount\n2026-02-01,12'], { type: 'text/csv' }), 'bad.csv');
    const response = await fetch(base + '/api/quests/upload', { method: 'POST', body: form });
    assert.equal(response.status, 400);
  });

  test('review grants XP once, updates progress, reports and export use stored data', async () => {
    let response = await json(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'Food' }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.player.xp, 10);
    assert.equal(response.data.quest.bossHealth, 50);

    response = await json(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'Food' }),
    });
    assert.equal(response.status, 409);

    const player = await json('/api/player');
    assert.equal(player.data.player.xp, 10);
    assert.equal(player.data.player.level, 1);

    const report = await json(`/api/quests/${questId}/report`);
    assert.equal(report.data.report.totalExpenses, 720.5);
    assert.equal(report.data.report.highestSpendingCategory, 'Food');

    const exported = await fetch(base + `/api/quests/${questId}/export`);
    assert.equal(exported.status, 200);
    assert.match(await exported.text(), /Final Category/);
  });

  test('undo reverses progress and XP', async () => {
    const response = await json(`/api/transactions/${transactionId}/undo`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(response.data.player.xp, 0);
    assert.equal(response.data.quest.progress.reviewed, 0);
  });
});
