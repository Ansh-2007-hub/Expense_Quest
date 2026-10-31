'use strict';

function spreadsheetSafeCell(value) {
  const raw = String(value ?? '');
  // Prefix spreadsheet formula leaders, including values preceded by control
  // characters or whitespace that spreadsheet importers may otherwise ignore.
  const safe = /^[\s\u0000-\u001f]*[=+\-@＝＋－＠\t\r\n]/u.test(raw)
    ? `'${raw}`
    : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function buildExpenseCsv(transactions, questCurrency) {
  const headers = ['Date', 'Description', 'Amount', 'Direction', 'Currency', 'Suggested Category', 'Final Category', 'Reviewed'];
  return [
    headers.map(spreadsheetSafeCell).join(','),
    ...transactions.map((transaction) => [
      transaction.date,
      transaction.description,
      transaction.amount,
      transaction.direction || 'debit',
      transaction.currency || questCurrency,
      transaction.suggested_category,
      transaction.final_category,
      transaction.reviewed ? 'true' : 'false',
    ].map(spreadsheetSafeCell).join(',')),
  ].join('\r\n');
}

module.exports = { spreadsheetSafeCell, buildExpenseCsv };
