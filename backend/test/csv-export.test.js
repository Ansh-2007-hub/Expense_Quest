'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spreadsheetSafeCell, buildExpenseCsv } = require('../src/csvExport');

test('CSV cells quote delimiters and neutralize spreadsheet formulas', () => {
  assert.equal(spreadsheetSafeCell('=1+1'), "\"'=1+1\"");
  assert.equal(spreadsheetSafeCell('  @SUM(A1:A2)'), "\"'  @SUM(A1:A2)\"");
  assert.equal(spreadsheetSafeCell('=cmd|\" /C calc'), "\"'=cmd|\"\" /C calc\"");
  assert.equal(spreadsheetSafeCell('Cafe, "North"'), '"Cafe, ""North"""');
  assert.equal(spreadsheetSafeCell('-42'), "\"'-42\"");
  assert.equal(spreadsheetSafeCell('+42'), "\"'+42\"");
  assert.equal(spreadsheetSafeCell('42'), '"42"');
  assert.equal(spreadsheetSafeCell('\t=2+2'), "\"'\t=2+2\"");
  assert.equal(spreadsheetSafeCell('＝1+1'), "\"'＝1+1\"");
});

test('expense export escapes descriptions and preserves CSV rows', () => {
  const csv = buildExpenseCsv([
    { date: '2026-01-01', description: '=HYPERLINK("https://example.test")', amount: 5, final_category: 'Other' },
  ], 'USD');
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.equal(csv.split('\r\n').length, 2);
});
