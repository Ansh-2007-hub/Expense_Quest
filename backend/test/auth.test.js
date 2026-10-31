'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashSessionToken,
} = require('../src/auth');

test('email normalization and password length validation are strict', () => {
  assert.equal(normalizeEmail('  User@Example.Test  '), 'user@example.test');
  assert.throws(() => normalizeEmail('not-an-email'), { status: 400 });
  assert.throws(() => validatePassword('short'), { status: 400 });
  assert.equal(validatePassword('long-enough-password'), 'long-enough-password');
});

test('passwords are salted and verified without storing plaintext', async () => {
  const password = 'correct horse battery staple';
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);
  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword('wrong password value', firstHash), false);
});

test('opaque session tokens are strong and stored as one-way hashes', () => {
  const token = createSessionToken();
  assert.ok(token.length >= 40);
  assert.notEqual(hashSessionToken(token), token);
  assert.equal(hashSessionToken(token), hashSessionToken(token));
});
