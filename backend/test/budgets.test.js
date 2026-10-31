'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildBudgetSummary } = require('../src/budgets');

test('monthly budget summary counts only current-month debits in the matching currency', () => {
  const summary = buildBudgetSummary({
    currency: 'USD',
    month: '2026-10',
    budget: { monthly_amount: 100, updated_at: new Date('2026-10-01T00:00:00Z') },
    transactions: [
      { date: '2026-10-05', amount: 65, direction: 'debit' },
      { date: '10/12/2026', amount: 20, direction: 'debit' },
      { date: '2026-10-12', amount: 30, direction: 'credit' },
      { date: '2026-09-30', amount: 25, direction: 'debit' },
    ],
  });
  assert.equal(summary.currency, 'USD');
  assert.equal(summary.currentMonthSpending, 85);
  assert.equal(summary.remaining, 15);
  assert.equal(summary.percentUsed, 85);
  assert.equal(summary.nearLimit, true);
  assert.equal(summary.overBudget, false);
});

test('monthly budget summary flags overspending and leaves unset budgets undefined', () => {
  const over = buildBudgetSummary({
    currency: 'INR',
    month: '2026-10',
    budget: { monthly_amount: 50 },
    transactions: [{ date: '2026-10-01', amount: 75, direction: 'debit' }],
  });
  assert.equal(over.remaining, -25);
  assert.equal(over.percentUsed, 150);
  assert.equal(over.nearLimit, false);
  assert.equal(over.overBudget, true);

  const unset = buildBudgetSummary({ currency: 'EUR', month: '2026-10', budget: null, transactions: [] });
  assert.equal(unset.budget, null);
  assert.equal(unset.remaining, null);
  assert.equal(unset.currentMonthSpending, 0);
});
