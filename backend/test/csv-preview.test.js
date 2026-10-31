'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
test('CSV preview parses BOM, quoted commas and common headers', async () => {
  const { parseCsv, inferColumnMapping } =
    await import('../../frontend/src/csvPreview.mjs');
  const parsed = parseCsv(
    '\uFEFFTransaction Date,Payee,Value\r\n2026-02-28,"Cafe, North",12.50\r\n',
  );
  assert.deepEqual(parsed.headers, ['Transaction Date', 'Payee', 'Value']);
  assert.equal(parsed.rows[0][1], 'Cafe, North');
  assert.deepEqual(inferColumnMapping(parsed.headers), {
    date: 0,
    description: 1,
    amount: 2,
    debit: null,
    credit: null,
    currency: null,
    category: null,
    direction: null,
  });
});

test('CSV preview detects possible duplicates and maps selected columns safely', async () => {
  const { parseCsv, analyzeMappedCsv, buildCanonicalCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const parsed = parseCsv(
    'Purchased On,Payee,Total,Notes\n2026-02-28,Metro,12.50,first\n2026-02-28,Metro,12.50,copy\n2026-03-01,Cafe,4.00,other\n',
  );
  const mapping = { date: 0, description: 1, amount: 2 };
  const analysis = analyzeMappedCsv(parsed, mapping, { currency: 'USD' });
  assert.equal(analysis.duplicates.length, 1);
  assert.equal(analysis.duplicates[0].duplicateOf, 2);

  const { csv, removedDuplicates } = buildCanonicalCsv(parsed, mapping, {
    excludeDuplicates: true,
    currency: 'USD',
  });
  assert.equal(removedDuplicates, 1);
  assert.match(csv, /Date,Description,Amount,Direction,Currency,Category/);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 3);
});

test('CSV preview requires distinct description and amount mappings and flags invalid rows', async () => {
  const { parseCsv, analyzeMappedCsv, buildCanonicalCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const parsed = parseCsv('Name,Cost\nCafe,-3\n,8\nCoffee,4\n');
  const mapping = { date: null, description: 0, amount: 1 };
  const analysis = analyzeMappedCsv(parsed, mapping, { currency: 'USD' });
  assert.equal(analysis.errors.length, 1);
  assert.throws(
    () => buildCanonicalCsv(parsed, mapping, { currency: 'USD' }),
    /exclude the invalid rows/,
  );
  assert.match(
    analyzeMappedCsv(parsed, { date: null, description: 0, amount: 0 }, { currency: 'USD' })
      .errors[0],
    /different CSV column/,
  );
  const { csv, removedInvalid } = buildCanonicalCsv(parsed, mapping, {
    excludeInvalid: true,
    currency: 'USD',
  });
  assert.equal(removedInvalid, 1);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 3);
});

test('CSV preview catches dates the backend would reject', async () => {
  const { parseCsv, analyzeMappedCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const parsed = parseCsv(
    'Date,Description,Amount\n2026-02-30,Cafe,4\n02/28/2026,Train,8\n',
  );
  const analysis = analyzeMappedCsv(parsed, {
    date: 0,
    description: 1,
    amount: 2,
  }, { currency: 'USD' });
  assert.match(analysis.rows[0].errors[0], /Date is invalid/);
  assert.equal(analysis.rows[1].errors.length, 0);
});

test('CSV preview handles debit and credit columns including zeroes and their totals', async () => {
  const { parseCsv, analyzeMappedCsv, buildCanonicalCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const valid = parseCsv(
    'Date,Narration,Debit,Credit,Currency,Category\n2026-04-01,Metro,1234.50,,USD,Travel\n2026-04-02,Refund,0,12.50,USD,Other\n',
  );
  const mapping = {
    date: 0,
    description: 1,
    amount: null,
    debit: 2,
    credit: 3,
    currency: 4,
    category: 5,
    direction: null,
  };
  const analysis = analyzeMappedCsv(valid, mapping);
  assert.equal(analysis.totalTransactions, 2);
  assert.equal(analysis.totalDebits, 1234.5);
  assert.equal(analysis.totalCredits, 12.5);
  assert.equal(analysis.currency, 'USD');
  assert.equal(analysis.rows[0].category, 'Travel');
  assert.equal(analysis.rows[1].direction, 'credit');

  const built = buildCanonicalCsv(valid, mapping);
  assert.match(built.csv, /1234\.50,debit,USD,Travel/);
  assert.match(built.csv, /12\.50,credit,USD,Other/);
  assert.equal(built.rows.length, 2);
});

test('CSV preview requires an explicit currency for ambiguous symbols and handles signed values', async () => {
  const { parseCsv, analyzeMappedCsv, buildCanonicalCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const quoted = parseCsv(
    'Date,Description,Amount\n2026-02-01,Cafe,"$1,250.50"\n2026-02-02,Refund,"(€12,50)"\n',
  );
  const mapping = { date: 0, description: 1, amount: 2 };
  const missingCurrency = analyzeMappedCsv(quoted, mapping);
  assert.equal(missingCurrency.errors.length, 1);
  assert.match(missingCurrency.rows[0].errors.join(' '), /currency code/);

  const analysis = analyzeMappedCsv(quoted, mapping, {
    currency: 'EUR',
    negativeAmountMeans: 'credit',
  });
  assert.equal(analysis.errors.length, 0);
  assert.equal(analysis.rows[0].amount, 1250.5);
  assert.equal(analysis.rows[0].direction, 'debit');
  assert.equal(analysis.rows[1].amount, 12.5);
  assert.equal(analysis.rows[1].direction, 'credit');
  assert.equal(analysis.totalDebits, 1250.5);
  assert.equal(analysis.totalCredits, 12.5);
  assert.equal(analysis.dateRange.from, '2026-02-01');

  const selectedAsExpense = analyzeMappedCsv(quoted, mapping, {
    currency: 'EUR',
    negativeAmountMeans: 'debit',
  });
  assert.equal(selectedAsExpense.rows[1].direction, 'debit');
  const built = buildCanonicalCsv(quoted, mapping, { currency: 'EUR' });
  assert.match(built.csv, /12\.50,credit,EUR/);

  const euro = analyzeMappedCsv(parseCsv('Description,Amount\nShop,€10.00\n'), {
    date: null,
    description: 0,
    amount: 1,
  });
  assert.equal(euro.currency, 'EUR');
  assert.equal(euro.errors.length, 0);
});

test('CSV preview reports mixed currencies, unsupported categories and blank rows without dropping data', async () => {
  const { parseCsv, analyzeMappedCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const parsed = parseCsv(
    'Date,Description,Amount,Currency,Category\n2026-01-01,Shop,10,USD,Shopping\n\n2026-01-02,Ride,12,EUR,Other\n2026-01-03,School,4,USD,Utilities\n',
  );
  assert.equal(parsed.emptyRowsSkipped, 1);
  assert.equal(parsed.rows.length, 3);
  const analysis = analyzeMappedCsv(parsed, {
    date: 0,
    description: 1,
    amount: 2,
    currency: 3,
    category: 4,
  });
  assert.equal(analysis.mixedCurrencies, true);
  assert.equal(analysis.errors.length, 3);
  assert.match(analysis.rows[2].errors.join(' '), /not supported/);
});

test('CSV preview preserves three-decimal currencies and rejects malformed signs', async () => {
  const { parseCsv, analyzeMappedCsv, buildCanonicalCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const parsed = parseCsv('Description,Amount,Currency\nMarket,1.234,KWD\n');
  const mapping = { date: null, description: 0, amount: 1, currency: 2 };
  const analysis = analyzeMappedCsv(parsed, mapping);
  assert.equal(analysis.errors.length, 0);
  assert.equal(analysis.rows[0].amount, 1.234);
  const built = buildCanonicalCsv(parsed, mapping);
  assert.match(built.csv, /1\.234,debit,KWD/);

  const malformed = analyzeMappedCsv(
    parseCsv('Description,Amount,Currency\nBad,1-2,KWD\n'),
    mapping,
  );
  assert.match(malformed.errors[0].errors.join(' '), /valid number/);
});

test('CSV preview rejects malformed quoting and inconsistent column counts', async () => {
  const { parseCsv } = await import('../../frontend/src/csvPreview.mjs');
  assert.throws(
    () => parseCsv('Description,Amount\n"Coffee,5\n'),
    /unclosed quoted/,
  );
  assert.throws(
    () => parseCsv('Description,Amount\nCoffee,5,extra\n'),
    /different number of columns/,
  );
});
