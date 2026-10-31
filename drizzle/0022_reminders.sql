CREATE TABLE IF NOT EXISTS reminder_preferences (
  user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, task_id TEXT NOT NULL,
  timezone TEXT NOT NULL, local_time TEXT NOT NULL, due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reminders_one_active_task ON reminders(user_id,task_id) WHERE status='scheduled';
CREATE INDEX IF NOT EXISTS reminders_owner_due ON reminders(user_id,status,due_at);
