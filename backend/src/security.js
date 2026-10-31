'use strict';

const { createHash } = require('node:crypto');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function createAuthRateLimiter({ limit = 20, windowMs = WINDOW_MS } = {}) {
  const windows = new Map();
  let callsSinceCleanup = 0;

  function increment(key, now) {
    const current = windows.get(key);
    const state = !current || now - current.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : current;
    state.count += 1;
    windows.set(key, state);
    return state;
  }

  return function authRateLimit(req, res, next) {
    const now = Date.now();
    const ipKey = `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}:${req.path}`;
    const ipWindow = increment(ipKey, now);
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase().slice(0, 254)
      : '';
    const accountKey = email
      ? `account:${req.path}:${createHash('sha256').update(email).digest('hex')}`
      : null;
    const accountWindow = accountKey ? increment(accountKey, now) : null;

    callsSinceCleanup += 1;
    if (callsSinceCleanup >= 256 || windows.size > MAX_TRACKED_KEYS) {
      callsSinceCleanup = 0;
      for (const [key, value] of windows) {
        if (now - value.startedAt >= windowMs) windows.delete(key);
      }
      while (windows.size > MAX_TRACKED_KEYS) windows.delete(windows.keys().next().value);
    }

    if (ipWindow.count > limit || accountWindow?.count > Math.min(limit, 10)) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        success: false,
        error: 'Too many account attempts. Please try again in a few minutes.',
      });
    }
    return next();
  };
}

module.exports = { securityHeaders, createAuthRateLimiter };
