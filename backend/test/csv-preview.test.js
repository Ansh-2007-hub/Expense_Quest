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
  });
});

test('CSV preview detects possible duplicates and maps selected columns safely', async () => {
  const { parseCsv, analyzeMappedCsv, buildCanonicalCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const parsed = parseCsv(
    'Purchased On,Payee,Total,Notes\n2026-02-28,Metro,12.50,first\n2026-02-28,Metro,12.50,copy\n2026-03-01,Cafe,4.00,other\n',
  );
  const mapping = { date: 0, description: 1, amount: 2 };
  const analysis = analyzeMappedCsv(parsed, mapping);
  assert.equal(analysis.duplicates.length, 1);
  assert.equal(analysis.duplicates[0].duplicateOf, 2);

  const { csv, removedDuplicates } = buildCanonicalCsv(parsed, mapping, {
    excludeDuplicates: true,
  });
  assert.equal(removedDuplicates, 1);
  assert.match(csv, /Date,Description,Amount/);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 3);
});

test('CSV preview requires distinct description and amount mappings and flags invalid rows', async () => {
  const { parseCsv, analyzeMappedCsv, buildCanonicalCsv } =
    await import('../../frontend/src/csvPreview.mjs');
  const parsed = parseCsv('Name,Cost\nCafe,-3\n,8\nCoffee,4\n');
  const mapping = { date: null, description: 0, amount: 1 };
  const analysis = analyzeMappedCsv(parsed, mapping);
  assert.equal(analysis.errors.length, 2);
  assert.throws(
    () => buildCanonicalCsv(parsed, mapping),
    /exclude the invalid rows/,
  );
  assert.match(
    analyzeMappedCsv(parsed, { date: null, description: 0, amount: 0 })
      .errors[0],
    /separate columns/,
  );
  const { csv, removedInvalid } = buildCanonicalCsv(parsed, mapping, {
    excludeInvalid: true,
  });
  assert.equal(removedInvalid, 2);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2);
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
  });
  assert.match(analysis.rows[0].errors[0], /Date is invalid/);
  assert.equal(analysis.rows[1].errors.length, 0);
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
