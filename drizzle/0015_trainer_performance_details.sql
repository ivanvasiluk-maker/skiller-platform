CREATE TABLE IF NOT EXISTS trainer_performance_details (
  plan_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  completed_part TEXT NOT NULL DEFAULT '',
  stopping_point TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
