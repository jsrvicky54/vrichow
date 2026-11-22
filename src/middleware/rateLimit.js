const rateLimit = require('express-rate-limit');
const config = require('../config');

const WINDOW_MS = 15 * 60 * 1000;

function tooMany(req, res) {
  res.status(429).render('login', {
    title: 'Log in',
    staffId: (req.body && req.body.staff_id) || '',
    error: 'Too many failed login attempts. Please wait 15 minutes and try again.',
  });
}

// Only FAILED attempts are counted (successful logins redirect with 302), so a
// whole office sharing one internet connection can still log in normally.
const loginIpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: config.loginMaxPerIp,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany,
});

// Limits guessing against one account, from any IP.
const loginAccountLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: config.loginMaxFailsPerAccount,
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => `acct:${String((req.body && req.body.staff_id) || '').trim().toLowerCase()}`,
  handler: tooMany,
});

module.exports = { loginIpLimiter, loginAccountLimiter };
