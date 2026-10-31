CREATE TABLE IF NOT EXISTS trainer_outcome_reports (
  plan_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reported_result TEXT NOT NULL,
  worsened INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
