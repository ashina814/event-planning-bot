CREATE TABLE IF NOT EXISTS special_bonuses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  amount          INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  thread_id       TEXT REFERENCES events(thread_id) ON DELETE SET NULL,
  month_key       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  decided_by      TEXT,
  decided_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_special_bonuses_month ON special_bonuses(month_key, status);
CREATE INDEX IF NOT EXISTS idx_special_bonuses_user ON special_bonuses(user_id, month_key);
