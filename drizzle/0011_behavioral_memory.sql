CREATE TABLE IF NOT EXISTS behavioral_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  action_urge TEXT NOT NULL,
  topic TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT '',
  thought TEXT NOT NULL DEFAULT '',
  emotion_body TEXT NOT NULL DEFAULT '',
  urge TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  consequences TEXT NOT NULL DEFAULT '',
  intervention_point TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS behavioral_memory_user_pattern
  ON behavioral_memory(user_id, kind, action_urge, created_at);
