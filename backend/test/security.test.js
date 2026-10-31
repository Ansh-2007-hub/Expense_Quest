'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthRateLimiter } = require('../src/security');

function invoke(limiter, { ip, email = 'player@example.test' }) {
  let statusCode = 200;
  const headers = {};
  let nextCalled = false;
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(value) { statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  limiter({ ip, path: '/api/auth/login', body: { email } }, res, () => { nextCalled = true; });
  return { statusCode, headers, nextCalled, body: res.body };
}

test('auth rate limiter caps repeated attempts and supplies retry guidance', () => {
  const limiter = createAuthRateLimiter({ limit: 4, windowMs: 60_000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(invoke(limiter, { ip: '192.0.2.1', email: `player${attempt}@example.test` }).nextCalled, true);
  }
  const blocked = invoke(limiter, { ip: '192.0.2.1', email: 'another@example.test' });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '60');
  assert.equal(blocked.nextCalled, false);
});

test('auth rate limiter also caps attempts against one email across IPs', () => {
  const limiter = createAuthRateLimiter({ limit: 20, windowMs: 60_000 });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(invoke(limiter, { ip: `192.0.2.${attempt + 1}` }).nextCalled, true);
  }
  const blocked = invoke(limiter, { ip: '198.51.100.1' });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.nextCalled, false);
});
