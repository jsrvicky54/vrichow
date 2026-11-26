const db = require('../db');

async function listForDepartment(department) {
  if (!department) return [];
  const { rows } = await db.query(
    `SELECT id, department, title, filename, created_at
       FROM department_ebooks
      WHERE LOWER(BTRIM(department)) = LOWER(BTRIM($1))
      ORDER BY title, created_at DESC`,
    [department]
  );
  return rows;
}

async function listAll() {
  const { rows } = await db.query(
    `SELECT id, department, title, filename, created_at
       FROM department_ebooks
      ORDER BY department, title, created_at DESC`
  );
  return rows;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, department, title, filename, file_data
       FROM department_ebooks WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ department, title, filename, content, uploadedBy }) {
  const { rows } = await db.query(
    `INSERT INTO department_ebooks
       (department, title, filename, file_data, uploaded_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [department, title, filename, content, uploadedBy]
  );
  return rows[0];
}

module.exports = { listForDepartment, listAll, findById, create };
