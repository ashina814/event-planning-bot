CREATE TABLE IF NOT EXISTS earnings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  thread_id       TEXT REFERENCES events(thread_id) ON DELETE SET NULL,
  source          TEXT NOT NULL,
  role_label      TEXT NOT NULL,
  base_amount     INTEGER NOT NULL,
  multiplier      REAL NOT NULL DEFAULT 1,
  amount          INTEGER NOT NULL,
  month_key       TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  voided          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_earnings_user_month ON earnings(user_id, month_key);
CREATE INDEX IF NOT EXISTS idx_earnings_thread ON earnings(thread_id);
CREATE INDEX IF NOT EXISTS idx_earnings_month ON earnings(month_key, voided);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  month_key       TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'draft',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  finalized_at    INTEGER
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  base_salary     INTEGER NOT NULL DEFAULT 0,
  work_total      INTEGER NOT NULL DEFAULT 0,
  eval_bonus      INTEGER NOT NULL DEFAULT 0,
  special_bonus   INTEGER NOT NULL DEFAULT 0,
  cap             INTEGER,
  cap_action      TEXT,
  total           INTEGER NOT NULL DEFAULT 0,
  note            TEXT,
  UNIQUE(run_id, user_id)
);
