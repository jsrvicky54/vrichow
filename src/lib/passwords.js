const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ROUNDS = 12;

function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Returns an error message, or null if the password is acceptable. */
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters long.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.'; // bcrypt limit
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number.';
  return null;
}

/** Readable temporary password, e.g. "kite-8274-Rmqx". */
function generateTempPassword() {
  const words = ['river', 'maple', 'cloud', 'tiger', 'lemon', 'stone', 'pearl', 'cedar', 'delta', 'orbit', 'mango', 'comet'];
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const word = words[crypto.randomInt(words.length)];
  const digits = String(crypto.randomInt(1000, 10000));
  let tail = '';
  for (let i = 0; i < 4; i++) tail += letters[crypto.randomInt(letters.length)];
  return `${word}-${digits}-${tail}`;
}

// Used so a failed login for an unknown user takes as long as a real one.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', ROUNDS);

module.exports = { hashPassword, verifyPassword, validatePassword, generateTempPassword, DUMMY_HASH };
