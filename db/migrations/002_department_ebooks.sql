CREATE TABLE IF NOT EXISTS department_ebooks (
  id          SERIAL PRIMARY KEY,
  department  VARCHAR(100) NOT NULL,
  title       VARCHAR(150) NOT NULL,
  filename    VARCHAR(200) NOT NULL,
  file_data   BYTEA NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS department_ebooks_department_idx
  ON department_ebooks (LOWER(BTRIM(department)));
