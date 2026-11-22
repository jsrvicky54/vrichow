const db = require('../db');
const audit = require('./audit');
const time = require('../lib/time');
const { UserError } = require('../lib/errors');

const ENTRY_COLUMNS = `a.id, a.user_id, a.sign_in_at, a.sign_out_at, a.entered_late, a.note,
                       a.edited_by, a.created_at, a.updated_at`;

/** Adds computed fields used by views and exports. */
function decorate(row) {
  if (!row) return row;
  row.minutes = time.minutesBetween(row.sign_in_at, row.sign_out_at);
  row.date_key = time.dateKey(row.sign_in_at);
  return row;
}

/** Plain snapshot of an entry for the audit log. */
function snapshot(row) {
  return {
    user_id: row.user_id,
    staff_id: row.staff_id,
    name: row.name,
    sign_in_at: row.sign_in_at ? new Date(row.sign_in_at).toISOString() : null,
    sign_out_at: row.sign_out_at ? new Date(row.sign_out_at).toISOString() : null,
    entered_late: row.entered_late,
    note: row.note || null,
  };
}

async function getOpenEntry(userId, client = db) {
  const { rows } = await client.query(
    `SELECT ${ENTRY_COLUMNS} FROM attendance a WHERE a.user_id = $1 AND a.sign_out_at IS NULL`,
    [userId]
  );
  return decorate(rows[0] || null);
}

/**
 * Current state for the staff portal:
 *   'out'      - not signed in
 *   'in'       - signed in today
 *   'forgot'   - still open from a previous day; must enter leaving time first
 */
async function getStatus(userId) {
  const open = await getOpenEntry(userId);
  if (!open) return { state: 'out', open: null };
  if (open.date_key < time.todayKey()) return { state: 'forgot', open };
  return { state: 'in', open };
}

/** Locks the user's row so two quick clicks cannot both succeed. */
async function lockUser(client, userId) {
  await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
}

async function signIn(userId) {
  return db.withTransaction(async (client) => {
    await lockUser(client, userId);
    const open = await getOpenEntry(userId, client);
    if (open) {
      if (open.date_key < time.todayKey()) {
        throw new UserError('Please enter the time you left on your last working day before signing in.');
      }
      throw new UserError(`You are already signed in (since ${time.fmtTime(open.sign_in_at)}).`);
    }
    // now() is the database server's clock: the visitor's device time is never used.
    const { rows } = await client.query(
      `INSERT INTO attendance (user_id, sign_in_at) VALUES ($1, now()) RETURNING *`,
      [userId]
    );
    return decorate(rows[0]);
  });
}

async function signOut(userId) {
  return db.withTransaction(async (client) => {
    await lockUser(client, userId);
    const open = await getOpenEntry(userId, client);
    if (!open) throw new UserError('You are not signed in.');
    if (open.date_key < time.todayKey()) {
      throw new UserError('You did not sign out on a previous day. Please enter the time you left.');
    }
    const { rows } = await client.query(
      `UPDATE attendance SET sign_out_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
      [open.id]
    );
    return decorate(rows[0]);
  });
}

/** Staff enters the time they left on a day they forgot to sign out. */
async function enterMissedSignOut(userId, timeStr) {
  return db.withTransaction(async (client) => {
    await lockUser(client, userId);
    const open = await getOpenEntry(userId, client);
    if (!open || open.date_key >= time.todayKey()) {
      throw new UserError('There is no earlier day waiting for a sign-out time.');
    }
    const leftAt = time.localToDate(open.date_key, timeStr);
    if (!leftAt) throw new UserError('Please enter a valid time, for example 06:00 PM.');
    if (leftAt <= new Date(open.sign_in_at)) {
      throw new UserError(`The leaving time must be after your sign-in time (${time.fmtTime(open.sign_in_at)}).`);
    }
    const { rows } = await client.query(
      `UPDATE attendance
          SET sign_out_at = $1, entered_late = TRUE, updated_at = now(),
              note = CONCAT_WS(' ', NULLIF(note, ''), 'Sign-out time entered later by staff.')
        WHERE id = $2 RETURNING *`,
      [leftAt, open.id]
    );
    return decorate(rows[0]);
  });
}

/** One person's entries that started within [start, end). */
async function listForUser(userId, { start, end }) {
  const { rows } = await db.query(
    `SELECT ${ENTRY_COLUMNS} FROM attendance a
      WHERE a.user_id = $1 AND a.sign_in_at >= $2 AND a.sign_in_at < $3
      ORDER BY a.sign_in_at`,
    [userId, start, end]
  );
  return rows.map(decorate);
}

/** Admin search. `limit` is optional (exports pass none). */
async function search({ start, end, userId, limit }) {
  const params = [start, end];
  let where = 'a.sign_in_at >= $1 AND a.sign_in_at < $2';
  if (userId) {
    params.push(userId);
    where += ` AND a.user_id = $${params.length}`;
  }
  let limitSql = '';
  if (limit) {
    params.push(limit + 1);
    limitSql = `LIMIT $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT ${ENTRY_COLUMNS}, u.staff_id, u.name, u.department, e.name AS edited_by_name
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN users e ON e.id = a.edited_by
      WHERE ${where}
      ORDER BY a.sign_in_at DESC, u.name
      ${limitSql}`,
    params
  );
  const truncated = Boolean(limit && rows.length > limit);
  return { rows: (truncated ? rows.slice(0, limit) : rows).map(decorate), truncated };
}

async function findById(id, client = db) {
  const { rows } = await client.query(
    `SELECT ${ENTRY_COLUMNS}, u.staff_id, u.name, u.department
       FROM attendance a JOIN users u ON u.id = a.user_id
      WHERE a.id = $1`,
    [id]
  );
  return decorate(rows[0] || null);
}

/** Who is signed in right now (open entries). */
async function currentlyIn() {
  const { rows } = await db.query(
    `SELECT ${ENTRY_COLUMNS}, u.staff_id, u.name, u.department
       FROM attendance a JOIN users u ON u.id = a.user_id
      WHERE a.sign_out_at IS NULL
      ORDER BY a.sign_in_at`
  );
  return rows.map(decorate);
}

/** Admin correction. Records old and new values in the audit log. */
async function adminUpdate(id, { signInAt, signOutAt, note }, adminId) {
  return db.withTransaction(async (client) => {
    const { rows: locked } = await client.query('SELECT id FROM attendance WHERE id = $1 FOR UPDATE', [id]);
    if (!locked.length) throw new UserError('This entry no longer exists.');
    const before = await findById(id, client);

    if (signOutAt && signOutAt <= signInAt) throw new UserError('Sign-out time must be after sign-in time.');
    if (signInAt > new Date()) throw new UserError('Sign-in time cannot be in the future.');
    if (signOutAt && signOutAt > new Date()) throw new UserError('Sign-out time cannot be in the future.');

    if (!signOutAt) {
      const other = await client.query(
        'SELECT id FROM attendance WHERE user_id = $1 AND sign_out_at IS NULL AND id <> $2',
        [before.user_id, id]
      );
      if (other.rows.length) {
        throw new UserError('This person already has another entry without a sign-out time. Please add a sign-out time.');
      }
    }

    // Overlap check: entries for the same person must not overlap.
    const overlap = await client.query(
      `SELECT id FROM attendance
        WHERE user_id = $1 AND id <> $2
          AND tstzrange(sign_in_at, COALESCE(sign_out_at, 'infinity'::timestamptz))
           && tstzrange($3::timestamptz, COALESCE($4::timestamptz, 'infinity'::timestamptz))`,
      [before.user_id, id, signInAt, signOutAt]
    );
    if (overlap.rows.length) throw new UserError('These times overlap with another entry for the same person.');

    await client.query(
      `UPDATE attendance SET sign_in_at = $1, sign_out_at = $2, note = $3, edited_by = $4, updated_at = now()
        WHERE id = $5`,
      [signInAt, signOutAt, note || null, adminId, id]
    );
    const after = await findById(id, client);

    await audit.record(client, {
      adminId,
      attendanceId: id,
      action: 'attendance.update',
      oldValue: snapshot(before),
      newValue: snapshot(after),
    });
    return after;
  });
}

async function adminDelete(id, adminId) {
  return db.withTransaction(async (client) => {
    const { rows: locked } = await client.query('SELECT id FROM attendance WHERE id = $1 FOR UPDATE', [id]);
    if (!locked.length) throw new UserError('This entry no longer exists.');
    const before = await findById(id, client);
    await client.query('DELETE FROM attendance WHERE id = $1', [id]);
    await audit.record(client, {
      adminId,
      attendanceId: id,
      action: 'attendance.delete',
      oldValue: snapshot(before),
      newValue: null,
    });
    return before;
  });
}

/**
 * Daily summary for one office-time day.
 * Includes active staff whose account existed that day, plus anyone who has an entry that day.
 */
async function dailySummary(dayKey) {
  const { start, end } = time.dayRange(dayKey);
  const { rows } = await db.query(
    `SELECT u.id, u.staff_id, u.name, u.department, u.active,
            MIN(a.sign_in_at)                AS first_in,
            MAX(a.sign_out_at)               AS last_out,
            COUNT(a.id)::int                 AS entries,
            BOOL_OR(a.id IS NOT NULL AND a.sign_out_at IS NULL) AS still_in,
            COALESCE(SUM(EXTRACT(EPOCH FROM (a.sign_out_at - a.sign_in_at)) / 60), 0)::int AS minutes
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.sign_in_at >= $1 AND a.sign_in_at < $2
      WHERE u.role = 'staff'
      GROUP BY u.id
     -- Active staff who existed that day, plus anyone with an entry that day.
     HAVING (u.active AND u.created_at < $2) OR COUNT(a.id) > 0
      ORDER BY u.name`,
    [start, end]
  );

  const present = [];
  const absent = [];
  const late = [];
  for (const r of rows) {
    if (r.entries > 0) {
      r.is_late = time.isLate(r.first_in);
      present.push(r);
      if (r.is_late) late.push(r);
    } else {
      absent.push(r);
    }
  }
  return { present, absent, late, total: rows.length };
}

module.exports = {
  getStatus,
  getOpenEntry,
  signIn,
  signOut,
  enterMissedSignOut,
  listForUser,
  search,
  findById,
  currentlyIn,
  adminUpdate,
  adminDelete,
  dailySummary,
  snapshot,
};
