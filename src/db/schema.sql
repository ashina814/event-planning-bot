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
  -- NULL = 1枚目だけの途中保存。非NULLで提出確定。
  submitted_at    INTEGER,
  updated_at      INTEGER NOT NULL,
  UNIQUE(user_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_self_reviews_month ON self_reviews(month_key);

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
