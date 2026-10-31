'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildQuestReport } = require('../src/reports');

test('quest report consumes Mongo aggregation document and maps expense insights', async () => {
  let pipeline;
  const report = await buildQuestReport({
    aggregate(stages) {
      pipeline = stages;
      return { next: async () => ({
        summary: [{ totalTransactions: 2, debitCount: 1, debits: 25, credits: 5 }],
        categories: [{ _id: 'Food', spending: 25, count: 1 }],
        merchants: [{ _id: 'market', merchant: 'Market', spending: 25, count: 1 }],
        top: [{ date: '2026-01-01', description: 'Market', amount: 25, category: 'Food' }],
        monthly: [{ _id: '2026-01', spending: 25 }],
      }) };
    },
  }, { userId: 'u1', questId: 7, currency: 'USD' });

  assert.deepEqual(pipeline[0], { $match: { user_id: 'u1', quest_id: 7 } });
  assert.equal(report.totalExpenses, 25);
  assert.equal(report.totalCredits, 5);
  assert.equal(report.netSpend, 20);
  assert.equal(report.topMerchants[0].merchant, 'Market');
});

test('quest report returns a complete empty result when Mongo has no matching rows', async () => {
  const report = await buildQuestReport({ aggregate: () => ({ next: async () => null }) }, {
    userId: 'u1', questId: 7, currency: 'USD',
  });
  assert.equal(report.totalTransactions, 0);
  assert.equal(report.totalExpenses, 0);
  assert.deepEqual(report.categorySpending, []);
});
