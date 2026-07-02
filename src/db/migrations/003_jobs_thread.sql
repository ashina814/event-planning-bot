ALTER TABLE scheduled_jobs ADD COLUMN thread_id TEXT;

UPDATE scheduled_jobs
SET thread_id = COALESCE(
  json_extract(payload, '$.threadId'),
  json_extract(payload, '$.thread_id'),
  (
    SELECT todos.thread_id
    FROM todos
    WHERE todos.id = json_extract(payload, '$.todoId')
  ),
  (
    SELECT expenses.thread_id
    FROM expenses
    WHERE expenses.id = json_extract(payload, '$.expenseId')
  ),
  (
    SELECT announcements.thread_id
    FROM announcements
    WHERE announcements.id = COALESCE(
      json_extract(payload, '$.announcementId'),
      json_extract(payload, '$.announcement_id')
    )
  ),
  (
    SELECT timer_schedules.thread_id
    FROM timer_schedules
    WHERE timer_schedules.id = json_extract(payload, '$.scheduleId')
  )
)
WHERE thread_id IS NULL
  AND json_valid(payload);

CREATE INDEX IF NOT EXISTS idx_jobs_thread ON scheduled_jobs(thread_id);
