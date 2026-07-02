ALTER TABLE events ADD COLUMN scale TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE event_roles ADD COLUMN confirmed_at INTEGER;

CREATE TABLE IF NOT EXISTS audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id        TEXT NOT NULL,
  action          TEXT NOT NULL,
  target_type     TEXT NOT NULL,
  target_id       TEXT,
  before_json     TEXT,
  after_json      TEXT,
  ts              INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id);
