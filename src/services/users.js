const db = require('../db');
const { hashPassword } = require('../lib/passwords');

const PUBLIC_COLUMNS = `id, staff_id, name, department, role, active, must_change_password,
                        password_changed_at, created_at`;

async function findById(id) {
  const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** Includes password_hash: only for login checks. */
async function findForLogin(staffId) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE LOWER(staff_id) = LOWER($1)`,
    [staffId]
  );
  return rows[0] || null;
}

async function getPasswordHash(id) {
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [id]);
  return rows[0] ? rows[0].password_hash : null;
}

async function list({ includeInactive = true } = {}) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users
     ${includeInactive ? '' : 'WHERE active'}
     ORDER BY active DESC, role, name`
  );
  return rows;
}

/** Staff (not admins) for filter drop-downs. */
async function listStaff() {
  const { rows } = await db.query(
    `SELECT id, staff_id, name, active FROM users WHERE role = 'staff' ORDER BY active DESC, name`
  );
  return rows;
}

async function departments() {
  const { rows } = await db.query(
    `SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department <> '' ORDER BY department`
  );
  return rows.map((r) => r.department);
}

async function staffIdExists(staffId, exceptId = 0) {
  const { rows } = await db.query(
    'SELECT 1 FROM users WHERE LOWER(staff_id) = LOWER($1) AND id <> $2',
    [staffId, exceptId]
  );
  return rows.length > 0;
}

async function create(client, { staffId, name, department, role, password }) {
  const hash = await hashPassword(password);
  const { rows } = await client.query(
    `INSERT INTO users (staff_id, name, department, role, password_hash, must_change_password)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING ${PUBLIC_COLUMNS}`,
    [staffId, name, department || null, role, hash]
  );
  return rows[0];
}

async function update(client, id, { staffId, name, department }) {
  const { rows } = await client.query(
    `UPDATE users SET staff_id = $1, name = $2, department = $3 WHERE id = $4 RETURNING ${PUBLIC_COLUMNS}`,
    [staffId, name, department || null, id]
  );
  return rows[0] || null;
}

async function setActive(client, id, active) {
  const { rows } = await client.query(
    `UPDATE users SET active = $1 WHERE id = $2 RETURNING ${PUBLIC_COLUMNS}`,
    [active, id]
  );
  return rows[0] || null;
}

/**
 * Sets a new password. `temporary` = true forces the person to choose a new
 * one at next login (used for admin resets).
 */
async function setPassword(client, id, password, { temporary }) {
  const hash = await hashPassword(password);
  const { rows } = await client.query(
    `UPDATE users SET password_hash = $1, must_change_password = $2, password_changed_at = clock_timestamp()
      WHERE id = $3 RETURNING password_changed_at`,
    [hash, temporary, id]
  );
  return rows[0] ? rows[0].password_changed_at : null;
}

module.exports = {
  findById,
  findForLogin,
  getPasswordHash,
  list,
  listStaff,
  departments,
  staffIdExists,
  create,
  update,
  setActive,
  setPassword,
};
