CREATE TABLE IF NOT EXISTS trainer_plan_pauses (
  plan_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  loop_status TEXT,
  updated_at TEXT NOT NULL
);
