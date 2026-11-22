const db = require('../db');

/** Writes one audit log row. Pass the transaction client so it commits together with the change. */
async function record(client, { adminId, attendanceId = null, action, oldValue = null, newValue = null }) {
  await client.query(
    `INSERT INTO audit_log (admin_id, attendance_id, action, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      adminId,
      attendanceId,
      action,
      oldValue === null ? null : JSON.stringify(oldValue),
      newValue === null ? null : JSON.stringify(newValue),
    ]
  );
}

async function list({ attendanceId, limit = 200, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (attendanceId) {
    params.push(attendanceId);
    where = `WHERE l.attendance_id = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT l.*, a.name AS admin_name, a.staff_id AS admin_staff_id
       FROM audit_log l
       LEFT JOIN users a ON a.id = l.admin_id
       ${where}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function count() {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM audit_log');
  return rows[0].n;
}

module.exports = { record, list, count };
