CREATE TABLE IF NOT EXISTS self_reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  month_key       TEXT NOT NULL,
  did             TEXT,
  good            TEXT,
  hard            TEXT,
  want_next       TEXT,
  improve         TEXT,
  need_support    TEXT,
  submitted_at    INTEGER,
  updated_at      INTEGER NOT NULL,
  UNIQUE(user_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_self_reviews_month ON self_reviews(month_key);
