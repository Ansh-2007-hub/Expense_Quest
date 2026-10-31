'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('transaction filters combine search, category, date range, and review status', async () => {
  const { filterAndSortTransactions } = await import(
    '../../frontend/src/transactionFilters.mjs'
  );
  const transactions = [
    { id: 1, date: '2026-01-01', description: 'Cafe North', amount: 12, category: 'Food' },
    { id: 2, date: '2026-02-15', description: 'Metro Pass', amount: 40, category: 'Travel', skipped: true },
    { id: 3, date: '2026-03-10', description: 'Cafe North', amount: 20, category: 'Food', reviewed: true },
    { id: 4, date: null, description: 'Un dated store', amount: 6, category: 'Shopping' },
  ];
  const filtered = filterAndSortTransactions(transactions, {
    query: 'cafe',
    category: 'Food',
    status: 'reviewed',
    fromDate: '2026-03-01',
    toDate: '2026-03-31',
  });
  assert.deepEqual(filtered.map((item) => item.id), [3]);

  const dateFiltered = filterAndSortTransactions(transactions, {
    fromDate: '2026-02-01',
    toDate: '2026-02-28',
    status: 'skipped',
  });
  assert.deepEqual(dateFiltered.map((item) => item.id), [2]);
});

test('transaction filters sort amounts and dates, and pagination clamps to valid pages', async () => {
  const { filterAndSortTransactions, pageTransactions } = await import(
    '../../frontend/src/transactionFilters.mjs'
  );
  const transactions = [
    { id: 1, date: '01/02/2026', description: 'B Shop', amount: 5 },
    { id: 2, date: '2026-02-03', description: 'A Cafe', amount: 25 },
    { id: 3, date: '2026-01-01', description: 'C Bus', amount: 10 },
  ];
  assert.deepEqual(
    filterAndSortTransactions(transactions, { sort: 'amount-high' }).map((item) => item.id),
    [2, 3, 1],
  );
  assert.deepEqual(
    filterAndSortTransactions(transactions, { sort: 'date-oldest' }).map((item) => item.id),
    [3, 1, 2],
  );
  assert.deepEqual(
    filterAndSortTransactions(transactions, { sort: 'merchant' }).map((item) => item.id),
    [2, 1, 3],
  );
  const page = pageTransactions(transactions, 9, 2);
  assert.equal(page.page, 2);
  assert.equal(page.totalPages, 2);
  assert.deepEqual(page.rows.map((item) => item.id), [3]);
});
