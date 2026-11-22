-- Initial schema for the office attendance system.
-- All timestamps are TIMESTAMPTZ and stored in UTC.

CREATE TABLE IF NOT EXISTS users (
  id                   SERIAL PRIMARY KEY,
  staff_id             VARCHAR(50)  NOT NULL,
  name                 VARCHAR(150) NOT NULL,
  department           VARCHAR(100),
  role                 VARCHAR(10)  NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  password_hash        TEXT         NOT NULL,
  active               BOOLEAN      NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
  password_changed_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Staff IDs are unique regardless of upper/lower case.
CREATE UNIQUE INDEX IF NOT EXISTS users_staff_id_lower_uq ON users (LOWER(staff_id));

CREATE TABLE IF NOT EXISTS attendance (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sign_in_at   TIMESTAMPTZ NOT NULL,
  sign_out_at  TIMESTAMPTZ,
  entered_late BOOLEAN     NOT NULL DEFAULT FALSE,  -- sign-out time typed in later by the staff member
  note         TEXT,
  edited_by    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_out_after_in CHECK (sign_out_at IS NULL OR sign_out_at > sign_in_at)
);

-- A person can have at most ONE open entry (signed in, not yet signed out).
-- This makes "signing in twice" impossible even under concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_open_per_user
  ON attendance (user_id) WHERE sign_out_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_user_sign_in_idx ON attendance (user_id, sign_in_at);
CREATE INDEX IF NOT EXISTS attendance_sign_in_idx      ON attendance (sign_in_at);

-- attendance_id deliberately has no foreign key so the log keeps the id
-- even after an entry is deleted.
CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  admin_id      INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  attendance_id INTEGER,
  action        VARCHAR(50) NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx    ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_attendance_idx ON audit_log (attendance_id);

-- Session store used by connect-pg-simple.
CREATE TABLE IF NOT EXISTS user_sessions (
  sid    VARCHAR      NOT NULL PRIMARY KEY,
  sess   JSON         NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);
