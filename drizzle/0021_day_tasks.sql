CREATE TABLE IF NOT EXISTS day_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','partial','done')),
  is_focus INTEGER NOT NULL DEFAULT 0 CHECK(is_focus IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,task_date,title_key)
);
CREATE INDEX IF NOT EXISTS day_tasks_owner_date ON day_tasks(user_id,task_date);
CREATE UNIQUE INDEX IF NOT EXISTS day_tasks_one_focus ON day_tasks(user_id,task_date) WHERE is_focus=1;
