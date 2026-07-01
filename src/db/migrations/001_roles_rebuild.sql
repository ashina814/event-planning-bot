ALTER TABLE event_roles ADD COLUMN role_kind TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE event_roles ADD COLUMN role_label TEXT;
ALTER TABLE event_roles ADD COLUMN ord INTEGER NOT NULL DEFAULT 0;

UPDATE event_roles
SET
  role_kind = CASE
    WHEN role_type = 'main' THEN 'main'
    ELSE 'custom'
  END,
  role_label = CASE role_type
    WHEN 'main' THEN NULL
    WHEN 'mc' THEN '司会・進行'
    WHEN 'announce' THEN '告知担当'
    WHEN 'record' THEN '集計・記録担当'
    WHEN 'prize' THEN '賞金・景品対応'
    WHEN 'support' THEN 'サポート'
    ELSE role_type
  END,
  ord = CASE role_type
    WHEN 'main' THEN 0
    WHEN 'mc' THEN 10
    WHEN 'announce' THEN 20
    WHEN 'record' THEN 30
    WHEN 'prize' THEN 40
    WHEN 'support' THEN 50
    ELSE 100
  END;

CREATE TABLE IF NOT EXISTS series_default_roles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id       INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  role_label      TEXT NOT NULL,
  ord             INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE(series_id, role_label)
);
