'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { categorize, categories } = require('../src/categorize');
const { parseExpenses, isValidDate, monthKeyFromDate } = require('../src/csv');

test('category suggestions preserve the API category order and resolve common merchants', () => {
  assert.deepEqual(categories, [
    'Food',
    'Shopping',
    'Travel',
    'Bills',
    'Entertainment',
    'Healthcare',
    'Education',
    'Other',
  ]);
  assert.equal(categorize('Uber Eats dinner'), 'Food');
  assert.equal(categorize('Uber ride'), 'Travel');
  assert.equal(categorize('Swiggy groceries'), 'Food');
  assert.equal(categorize('Amazon store'), 'Shopping');
  assert.equal(categorize('Monthly internet bill'), 'Bills');
  assert.equal(categorize('Apollo Pharmacy'), 'Healthcare');
  assert.equal(categorize('University course'), 'Education');
  assert.equal(categorize('Unknown merchant'), 'Other');
});

test('CSV parser supports aliased headers, quoted amounts, BOM and preserves valid dates', () => {
  const csv =
    '\uFEFFTransaction Date,Payee,Value\n2026-02-28,Uber Eats dinner,"$1,250.50"\n';
  const [expense] = parseExpenses(Buffer.from(csv));
  assert.deepEqual(expense, {
    date: '2026-02-28',
    description: 'Uber Eats dinner',
    amount: 1250.5,
    suggested_category: 'Food',
  });
});

test('CSV parser accepts optional dates and a common US slash date', () => {
  const [noDate] = parseExpenses(
    Buffer.from('Merchant,Amount\nCoffee Shop,5.25\n'),
  );
  const [dated] = parseExpenses(
    Buffer.from('Date,Description,Amount\n02/28/2026,Bus pass,10\n'),
  );
  assert.equal(noDate.date, null);
  assert.equal(dated.date, '02/28/2026');
  assert.equal(dated.suggested_category, 'Travel');
});

test('CSV parser rejects empty files, missing headers, malformed rows, invalid amounts and invalid dates', () => {
  assert.throws(
    () => parseExpenses(Buffer.from('')),
    /header and at least one expense row/,
  );
  assert.throws(
    () => parseExpenses(Buffer.from('Date,Amount\n2026-02-01,5\n')),
    /Required columns/,
  );
  assert.throws(
    () => parseExpenses(Buffer.from('Description,Amount\n"Coffee,5\n')),
    /Malformed CSV/,
  );
  assert.throws(
    () => parseExpenses(Buffer.from('Description,Amount\nCoffee,-2\n')),
    /non-negative numeric amount/,
  );
  assert.throws(
    () =>
      parseExpenses(
        Buffer.from('Date,Description,Amount\n2026-02-30,Train pass,5\n'),
      ),
    /Invalid date/,
  );
  assert.throws(
    () =>
      parseExpenses(
        Buffer.from('Date,Description,Amount\n31/02/2026,Train pass,5\n'),
      ),
    /Invalid date/,
  );
});

test('date parser validates calendar dates while accepting ordinary statement formats', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('02/28/2026'), true);
  assert.equal(isValidDate('28/02/2026'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('not a date'), false);
  assert.equal(isValidDate(''), true);
  assert.equal(monthKeyFromDate('2026-02-28'), '2026-02');
  assert.equal(monthKeyFromDate('02/28/2026'), '2026-02');
  assert.equal(monthKeyFromDate('28/02/2026'), '2026-02');
  assert.equal(monthKeyFromDate('not a date'), null);
});
