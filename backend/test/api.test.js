'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../../.env'),
});

const testMongoUri = process.env.TEST_MONGODB_URI;
const hasMongoUri = Boolean(testMongoUri);
if (testMongoUri) {
  const uriDatabase = decodeURIComponent(new URL(testMongoUri).pathname.replace(/^\//, ''));
  if (!/^expense_quest_test_[a-z0-9_]+$/i.test(uriDatabase)) {
    throw new Error('TEST_MONGODB_URI must name a dedicated expense_quest_test_* database.');
  }
  process.env.MONGODB_URI = testMongoUri;
  process.env.MONGODB_DATABASE = uriDatabase;
}

const { app, db } = require('../src/server');

describe(
  'Expense Quest API with MongoDB',
  {
    skip: hasMongoUri
      ? false
      : 'Set TEST_MONGODB_URI to a dedicated expense_quest_test_* database to run MongoDB integration tests.',
  },
  () => {
    let server;
    let base;
    let questId;
    let transactionId;
    let skippedTransactionId;
    let authToken;
    let secondUserToken;

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

    async function json(url, options = {}, { auth = true, token = authToken } = {}) {
      const headers = new Headers(options.headers || {});
      if (auth && token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(base + url, { ...options, headers });
      return { status: response.status, data: await response.json() };
    }

    test('health endpoint is live', async () => {
      const response = await json('/api/health');
      assert.equal(response.status, 200);
      assert.equal(response.data.status, 'ok');
    });

    test('private routes require an account; signup and sessions work', async () => {
      let response = await json('/api/player', {}, { auth: false });
      assert.equal(response.status, 401);

      response = await json('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '  player@example.test ', password: 'adventurer-secret-123' }),
      }, { auth: false });
      assert.equal(response.status, 201);
      assert.equal(response.data.user.email, 'player@example.test');
      assert.ok(response.data.token);
      authToken = response.data.token;

      const identity = await json('/api/auth/me');
      assert.equal(identity.status, 200);
      assert.equal(identity.data.user.id, response.data.user.id);

      const other = await json('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'other@example.test', password: 'another-secret-123' }),
      }, { auth: false });
      assert.equal(other.status, 201);
      secondUserToken = other.data.token;
    });

    test('preview validates and categorizes without creating a quest', async () => {
      const form = new FormData();
      form.append(
        'file',
        new Blob(['Date,Merchant,Amount\n2026-02-01,Uber Eats,12\n'], {
          type: 'text/csv',
        }),
        'preview.csv',
      );
      const response = await fetch(base + '/api/quests/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: form,
      });
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.preview.length, 1);
      assert.equal(data.preview[0].suggestedCategory, 'Food');
      assert.match(data.preview[0].suggestionReason, /Uber Eats/);
      assert.equal(data.preview[0].id, undefined);
    });

    test('monthly budgets persist by currency and accept clearing with zero', async () => {
      let response = await json('/api/budgets/USD');
      assert.equal(response.status, 200);
      assert.equal(response.data.budget, null);

      response = await json('/api/budgets/USD', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyAmount: 1200 }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.budget.monthlyAmount, 1200);

      response = await json('/api/budgets/USD', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyAmount: 0 }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.budget, null);

      response = await json('/api/budgets/USD', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyAmount: -1 }),
      });
      assert.equal(response.status, 400);
    });

    test('upload validates and categorizes actual CSV rows', async () => {
      const form = new FormData();
      form.append(
        'file',
        new Blob(
          [
            'Date,Merchant,Amount\n2026-02-01,Swiggy dinner,420.50\n2026-02-02,Metro card,300\n2026-02-03,Refund,-25\n',
          ],
          { type: 'text/csv' },
        ),
        'expenses.csv',
      );

      const response = await fetch(base + '/api/quests/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: form,
      });
      const data = await response.json();
      assert.equal(response.status, 201);
      assert.equal(data.quest.totalTransactions, 3);
      assert.equal(data.preview[0].suggestedCategory, 'Food');
      assert.match(data.preview[0].suggestionReason, /Swiggy/);
      assert.equal(data.preview[1].suggestedCategory, 'Travel');
      questId = data.quest.id;
      transactionId = data.preview[0].id;
      skippedTransactionId = data.preview[1].id;

      const isolated = await json(`/api/quests/${questId}`, {}, { token: secondUserToken });
      assert.equal(isolated.status, 404);
      const isolatedPlayer = await json('/api/player', {}, { token: secondUserToken });
      assert.equal(isolatedPlayer.data.player.xp, 0);
    });

    test('preview warns on exact duplicate imports and upload rejects them', async () => {
      const csv =
        'Date,Merchant,Amount\n2026-02-01,Swiggy dinner,420.50\n2026-02-02,Metro card,300\n2026-02-03,Refund,-25\n';
      const previewForm = new FormData();
      previewForm.append('file', new Blob([csv], { type: 'text/csv' }), 'same.csv');
      let response = await fetch(base + '/api/quests/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: previewForm,
      });
      let data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.duplicateImport, true);
      assert.equal(data.duplicateQuestId, questId);
      assert.equal(data.preview[2].direction, 'credit');

      const uploadForm = new FormData();
      uploadForm.append('file', new Blob([csv], { type: 'text/csv' }), 'same.csv');
      response = await fetch(base + '/api/quests/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: uploadForm,
      });
      data = await response.json();
      assert.equal(response.status, 409);
      assert.match(data.error, /already imported/);
    });

    test('skip state persists and can be resumed without XP', async () => {
      let response = await json(
        `/api/transactions/${skippedTransactionId}/skip`,
        {
          method: 'POST',
        },
      );
      assert.equal(response.status, 200);
      assert.equal(response.data.transaction.skipped, true);

      let list = await json(`/api/quests/${questId}/transactions`);
      assert.equal(list.data.transactions[1].skipped, true);

      response = await json(
        `/api/transactions/${skippedTransactionId}/unskip`,
        { method: 'POST' },
      );
      assert.equal(response.status, 200);
      assert.equal(response.data.transaction.skipped, false);

      const player = await json('/api/player');
      assert.equal(player.data.player.xp, 0);
    });

    test('rejects malformed expense CSV', async () => {
      const form = new FormData();
      form.append(
        'file',
        new Blob(['Date,Amount\n2026-02-01,12'], { type: 'text/csv' }),
        'bad.csv',
      );
      const response = await fetch(base + '/api/quests/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: form,
      });
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
      assert.deepEqual(response.data.player.achievements, ['First Review']);
      assert.equal(response.data.quest.bossHealth, 67);

      response = await json(`/api/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'Food' }),
      });
      assert.equal(response.status, 409);

      response = await json(`/api/transactions/${transactionId}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'Shopping' }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.transaction.category, 'Shopping');

      const player = await json('/api/player');
      assert.equal(player.data.player.xp, 10);
      assert.equal(player.data.player.level, 1);
      assert.deepEqual(player.data.player.achievements, ['First Review']);

      const report = await json(`/api/quests/${questId}/report`);
      assert.equal(report.data.report.totalExpenses, 720.5);
      assert.equal(report.data.report.totalDebits, 720.5);
      assert.equal(report.data.report.totalCredits, 25);
      assert.equal(report.data.report.netSpend, 695.5);
      assert.equal(report.data.report.highestSpendingCategory, 'Shopping');
      assert.equal(
        report.data.report.topMerchants[0].merchant,
        'Swiggy dinner',
      );
      assert.equal(report.data.report.topTransactions.length, 2);

      const exported = await fetch(base + `/api/quests/${questId}/export`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      assert.equal(exported.status, 200);
      assert.match(await exported.text(), /Final Category/);
    });

    test('undo reverses progress and XP', async () => {
      const response = await json(`/api/transactions/${transactionId}/undo`, {
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.equal(response.data.player.xp, 0);
      assert.deepEqual(response.data.player.achievements, []);
      assert.equal(response.data.quest.progress.reviewed, 0);
    });
  },
);
