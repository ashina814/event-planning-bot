CREATE TABLE IF NOT EXISTS role_rewards (
  role_label      TEXT PRIMARY KEY,
  amount          INTEGER NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS base_salary_grades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  amount          INTEGER NOT NULL,
  monthly_cap     INTEGER,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_grades (
  user_id         TEXT PRIMARY KEY,
  grade_id        INTEGER NOT NULL REFERENCES base_salary_grades(id),
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS misc_contributions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  role_label      TEXT NOT NULL,
  thread_id       TEXT REFERENCES events(thread_id) ON DELETE SET NULL,
  month_key       TEXT NOT NULL,
  note            TEXT,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_misc_contributions_user ON misc_contributions(user_id, month_key);
CREATE INDEX IF NOT EXISTS idx_misc_contributions_thread ON misc_contributions(thread_id);
