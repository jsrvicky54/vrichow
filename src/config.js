require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  }
  return value;
}

function int(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) ? n : fallback;
}

const lateAfter = process.env.LATE_AFTER || '10:00';
if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(lateAfter)) {
  throw new Error('LATE_AFTER must be in 24-hour HH:MM format, e.g. 10:00');
}

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  isProduction,
  port: int('PORT', 3000),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  sessionSecret: required('SESSION_SECRET'),
  sessionIdleMinutes: int('SESSION_IDLE_MINUTES', 30),
  trustProxy: int('TRUST_PROXY', 0),
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  lateAfter,
  loginMaxPerIp: int('LOGIN_MAX_PER_IP', 20),
  loginMaxFailsPerAccount: int('LOGIN_MAX_FAILS_PER_ACCOUNT', 5),
};

if (isProduction && (config.sessionSecret.length < 32 || config.sessionSecret.startsWith('change-me'))) {
  throw new Error('SESSION_SECRET must be a long random string (32+ characters) in production.');
}

module.exports = config;
