'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server');

test('upload route returns actionable CSV errors before any database write', async (context) => {
  const server = app.listen(0, '127.0.0.1');
  context.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const upload = async (contents, name, type = 'text/csv') => {
    const form = new FormData();
    form.append('file', new Blob([contents], { type }), name);
    const response = await fetch(`${base}/api/quests/upload`, {
      method: 'POST',
      body: form,
    });
    return { status: response.status, body: await response.json() };
  };

  const wrongFile = await upload('not a csv', 'expenses.txt', 'text/plain');
  assert.equal(wrongFile.status, 400);
  assert.equal(wrongFile.body.error, 'Upload a .csv file.');

  const missingAmount = await upload(
    'Date,Merchant\n2026-02-01,Cafe\n',
    'bad.csv',
  );
  assert.equal(missingAmount.status, 400);
  assert.match(missingAmount.body.error, /Required columns/);

  const invalidDate = await upload(
    'Date,Merchant,Amount\n2026-02-30,Cafe,12\n',
    'bad-date.csv',
  );
  assert.equal(invalidDate.status, 400);
  assert.match(invalidDate.body.error, /Invalid date/);
});
