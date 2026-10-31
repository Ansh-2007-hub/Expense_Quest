'use strict';

const { createHash, randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Enter a valid email address.');
    error.status = 400;
    throw error;
  }
  return email;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) {
    const error = new Error('Password must be between 10 and 128 characters.');
    error.status = 400;
    throw error;
  }
  return value;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `${salt.toString('hex')}.${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored || '').split('.');
  if (!/^[a-f\d]{32}$/.test(saltHex || '') || !/^[a-f\d]{128}$/.test(hashHex || '')) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function bearerToken(req) {
  const value = req.get('authorization') || '';
  const match = value.match(/^Bearer\s+([\w-]{40,100})$/i);
  return match?.[1] || null;
}

function publicUser(user) {
  return { id: String(user._id), email: user.email, createdAt: user.created_at.toISOString() };
}

module.exports = {
  SESSION_TTL_MS,
  normalizeEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  createSessionToken,
  hashSessionToken,
  bearerToken,
  publicUser,
};
