#!/usr/bin/env node
/**
 * Creates an admin account (or resets the password of an existing admin).
 *
 * Interactive:      npm run create-admin
 * Non-interactive:  ADMIN_ID=admin ADMIN_NAME="Office Admin" ADMIN_PASSWORD='...' npm run create-admin
 */
const readline = require('readline');
const { pool } = require('../src/db');
const { hashPassword, validatePassword } = require('../src/lib/passwords');

function ask(rl, question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    if (!hidden) return rl.question(question, (a) => resolve(a.trim()));
    // Hide typed characters for passwords.
    const out = rl.output;
    const origWrite = out.write.bind(out);
    rl.question(question, (a) => {
      out.write = origWrite;
      out.write('\n');
      resolve(a);
    });
    out.write = (chunk) => (chunk.includes(question) ? origWrite(chunk) : true);
  });
}

async function main() {
  let staffId = process.env.ADMIN_ID;
  let name = process.env.ADMIN_NAME;
  let password = process.env.ADMIN_PASSWORD;

  if (!staffId || !name || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    staffId = staffId || (await ask(rl, 'Admin login ID (e.g. admin): '));
    name = name || (await ask(rl, 'Admin full name: '));
    if (!password) {
      password = await ask(rl, 'Password (min 8 characters): ', { hidden: true });
      const again = await ask(rl, 'Repeat password: ', { hidden: true });
      if (password !== again) {
        rl.close();
        throw new Error('Passwords do not match.');
      }
    }
    rl.close();
  }

  if (!staffId || !name) throw new Error('Login ID and name are required.');
  const problem = validatePassword(password);
  if (problem) throw new Error(problem);

  const hash = await hashPassword(password);
  const existing = await pool.query('SELECT id, role FROM users WHERE LOWER(staff_id) = LOWER($1)', [staffId]);

  if (existing.rows.length) {
    const u = existing.rows[0];
    if (u.role !== 'admin') {
      throw new Error(`"${staffId}" already exists as a staff account. Choose a different admin ID.`);
    }
    await pool.query(
      `UPDATE users SET name = $1, password_hash = $2, active = TRUE, must_change_password = FALSE,
              password_changed_at = now() WHERE id = $3`,
      [name, hash, u.id]
    );
    console.log(`Admin "${staffId}" already existed: name and password updated, account active.`);
  } else {
    await pool.query(
      `INSERT INTO users (staff_id, name, department, role, password_hash)
       VALUES ($1, $2, 'Administration', 'admin', $3)`,
      [staffId, name, hash]
    );
    console.log(`Admin account "${staffId}" created. You can now log in.`);
  }
}

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
