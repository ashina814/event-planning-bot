PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS bot_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS series (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  description     TEXT,
  created_at      INTEGER NOT NULL,
  archived        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS series_sections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id       INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  ord             INTEGER NOT NULL,
  name            TEXT NOT NULL,
  default_minutes INTEGER,
  per_person_sec  INTEGER,
  UNIQUE(series_id, ord)
);

CREATE TABLE IF NOT EXISTS series_default_roles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id       INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  role_label      TEXT NOT NULL,
  ord             INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE(series_id, role_label)
);

CREATE TABLE IF NOT EXISTS events (
  thread_id       TEXT PRIMARY KEY,
  series_id       INTEGER REFERENCES series(id),
  title           TEXT NOT NULL,
  status          TEXT NOT NULL,
  scale           TEXT NOT NULL DEFAULT 'normal',
  scheduled_at    INTEGER,
  control_msg_id  TEXT,
  parent_msg_id   TEXT,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  closed_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_scheduled ON events(scheduled_at);

CREATE TABLE IF NOT EXISTS event_roles (
  thread_id       TEXT NOT NULL REFERENCES events(thread_id) ON DELETE CASCADE,
  role_type       TEXT NOT NULL,
  role_kind       TEXT NOT NULL DEFAULT 'custom',
  role_label      TEXT,
  ord             INTEGER NOT NULL DEFAULT 0,
  user_id         TEXT NOT NULL,
  assigned_at     INTEGER NOT NULL,
  confirmed_at    INTEGER,
  PRIMARY KEY (thread_id, role_type, user_id)
);

CREATE TABLE IF NOT EXISTS handover_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id       TEXT NOT NULL REFERENCES events(thread_id) ON DELETE CASCADE,
  role_type       TEXT NOT NULL,
  from_user       TEXT,
  to_user         TEXT NOT NULL,
  reason          TEXT,
  pending_tasks   TEXT,
  declared_msg_id TEXT,
  ts              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id       TEXT NOT NULL REFERENCES events(thread_id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  source_channel_id TEXT,
  source_message_id TEXT,
  target_channel_id TEXT,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  posted_msg_id   TEXT,
  posted_at       INTEGER,
  scheduled_at    INTEGER,
  enable_participants INTEGER NOT NULL DEFAULT 0,
  participants_emojis TEXT
);

CREATE TABLE IF NOT EXISTS timer_schedules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id       TEXT NOT NULL REFERENCES events(thread_id) ON DELETE CASCADE,
  notify_channel  TEXT NOT NULL,
  mention_role    TEXT,
  pre_notice_min  INTEGER NOT NULL DEFAULT 3,
  state           TEXT NOT NULL DEFAULT 'idle',
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timer_sections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id     INTEGER NOT NULL REFERENCES timer_schedules(id) ON DELETE CASCADE,
  ord             INTEGER NOT NULL,
  name            TEXT NOT NULL,
  planned_start   INTEGER NOT NULL,
  planned_minutes INTEGER NOT NULL,
  actual_start    INTEGER,
  actual_end      INTEGER,
  UNIQUE(schedule_id, ord)
);

CREATE TABLE IF NOT EXISTS section_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id       INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  section_name    TEXT NOT NULL,
  thread_id       TEXT NOT NULL,
  participants    INTEGER,
  actual_minutes  INTEGER NOT NULL,
  ts              INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_section_history ON section_history(series_id, section_name);

CREATE TABLE IF NOT EXISTS participants_config (
  thread_id       TEXT PRIMARY KEY REFERENCES events(thread_id) ON DELETE CASCADE,
  mode            TEXT NOT NULL,
  reaction_target_channel TEXT,
  reaction_target_msg     TEXT,
  -- JSON array with exactly two entries: 0 = 参加, 1 = 不参加.
  reaction_emojis TEXT,
  post_target_channel TEXT,
  post_target_thread  TEXT,
  deadline_at     INTEGER,
  frozen          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS participants_count_cache (
  thread_id       TEXT NOT NULL REFERENCES events(thread_id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  count_normal    INTEGER NOT NULL DEFAULT 0,
  count_late      INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (thread_id, label)
);

CREATE TABLE IF NOT EXISTS todos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id       TEXT REFERENCES events(thread_id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  assignee        TEXT,
  due_at          INTEGER,
  status          TEXT NOT NULL DEFAULT 'open',
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  done_at         INTEGER,
  source          TEXT,
  source_msg_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_at);

CREATE TABLE IF NOT EXISTS expenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id       TEXT REFERENCES events(thread_id) ON DELETE SET NULL,
  category        TEXT NOT NULL,
  amount          INTEGER NOT NULL,
  direction       TEXT NOT NULL,
  recipient_id    TEXT,
  responder_id    TEXT NOT NULL,
  proof_url       TEXT,
  proof_msg_id    TEXT,
  memo            TEXT,
  occurred_at     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  proof_status    TEXT NOT NULL DEFAULT 'attached',
  corrects_id     INTEGER REFERENCES expenses(id),
  voided          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_expenses_thread ON expenses(thread_id);
CREATE INDEX IF NOT EXISTS idx_expenses_occurred ON expenses(occurred_at);

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

CREATE TABLE IF NOT EXISTS expense_thresholds (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL UNIQUE,
  threshold       INTEGER NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_alerts_fired (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,
  scope_key       TEXT NOT NULL,
  fired_at        INTEGER NOT NULL,
  UNIQUE(kind, scope_key)
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,
  payload         TEXT NOT NULL,
  thread_id       TEXT,
  fire_at         INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  fired_at        INTEGER,
  error           TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_pending ON scheduled_jobs(status, fire_at);
CREATE INDEX IF NOT EXISTS idx_jobs_thread ON scheduled_jobs(thread_id);
