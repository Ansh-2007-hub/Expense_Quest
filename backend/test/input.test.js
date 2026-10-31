'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  categorize,
  categories,
  suggestCategory,
} = require('../src/categorize');
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
  assert.match(suggestCategory('Uber Eats dinner').reason, /Uber Eats/);
  assert.match(
    suggestCategory('Unknown merchant').reason,
    /No merchant rule matched/,
  );
});

test('CSV parser supports aliased headers, quoted amounts, BOM and preserves valid dates', () => {
  const csv =
    '\uFEFFTransaction Date,Payee,Value\n2026-02-28,Uber Eats dinner,"$1,250.50"\n';
  const [expense] = parseExpenses(Buffer.from(csv));
  assert.equal(expense.date, '2026-02-28');
  assert.equal(expense.description, 'Uber Eats dinner');
  assert.equal(expense.amount, 1250.5);
  assert.equal(expense.direction, 'debit');
  assert.equal(expense.currency, null);
  assert.equal(expense.imported_category, null);
  assert.equal(expense.suggested_category, 'Food');
  assert.equal(expense.suggestion_reason, 'Matched “Uber Eats” to the Food rule.');
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
  const [negativeAmount] = parseExpenses(
    Buffer.from('Description,Amount\nCoffee,-2\n'),
  );
  assert.equal(negativeAmount.amount, 2);
  assert.equal(negativeAmount.direction, 'credit');
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

test('CSV parser handles debit and credit columns, narration, imported category and currency', () => {
  const rows = parseExpenses(Buffer.from(
    'Date,Narration,Debit,Credit,Currency,Category\n2026-02-01,Metro,1234.50,,USD,Travel\n2026-02-02,Refund,,12.50,USD,Other\n',
  ));
  assert.equal(rows[0].description, 'Metro');
  assert.equal(rows[0].amount, 1234.5);
  assert.equal(rows[0].direction, 'debit');
  assert.equal(rows[0].currency, 'USD');
  assert.equal(rows[0].imported_category, 'Travel');
  assert.equal(rows[1].amount, 12.5);
  assert.equal(rows[1].direction, 'credit');
  assert.equal(rows[1].suggested_category, 'Other');
});

test('CSV parser handles signed and parenthesized amounts without guessing shared currency symbols', () => {
  const [refund] = parseExpenses(Buffer.from(
    'Description,Amount\nCard refund,"(€1.234,50)"\n',
  ));
  assert.equal(refund.amount, 1234.5);
  assert.equal(refund.direction, 'credit');
  assert.equal(refund.currency, 'EUR');

  const [dollar] = parseExpenses(Buffer.from('Description,Amount\nCafe,$12.50\n'));
  assert.equal(dollar.amount, 12.5);
  assert.equal(dollar.currency, null);

  const [threeDigitCurrency] = parseExpenses(
    Buffer.from('Description,Amount,Currency\nMarket,1.234,KWD\n'),
  );
  assert.equal(threeDigitCurrency.amount, 1.234);
  assert.equal(threeDigitCurrency.currency, 'KWD');
  assert.throws(
    () => parseExpenses(Buffer.from('Description,Amount\nBad,1-2\n')),
    /Invalid amount/,
  );
});

test('CSV parser rejects ambiguous debit-credit rows, unsupported categories, and mixed currencies', () => {
  assert.throws(
    () => parseExpenses(Buffer.from('Description,Debit,Credit\nShop,10,5\n')),
    /both debit and credit/,
  );
  assert.throws(
    () => parseExpenses(Buffer.from('Description,Amount,Currency\nShop,10,USD\nRide,5,EUR\n')),
    /one currency/,
  );
  assert.throws(
    () => parseExpenses(Buffer.from('Description,Amount,Category\nShop,10,Utilities\n')),
    /Unsupported category/,
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
