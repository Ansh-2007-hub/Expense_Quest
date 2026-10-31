'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server');

test('expense upload routes reject anonymous access before parsing financial files', async (context) => {
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

  const form = new FormData();
  form.append('file', new Blob(['=financial data'], { type: 'text/csv' }), 'expenses.csv');
  const response = await fetch(`${base}/api/quests/upload`, { method: 'POST', body: form });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /sign in/i);
});
