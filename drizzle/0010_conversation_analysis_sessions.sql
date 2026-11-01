CREATE TABLE IF NOT EXISTS conversation_analysis_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stage TEXT NOT NULL DEFAULT 'clarify',
  analysis_depth TEXT NOT NULL DEFAULT 'simple',
  original_text TEXT NOT NULL,
  kind TEXT NOT NULL,
  mode TEXT NOT NULL,
  signal TEXT NOT NULL,
  urge TEXT NOT NULL,
  intensity INTEGER NOT NULL,
  risk TEXT NOT NULL DEFAULT 'no',
  clarification TEXT NOT NULL DEFAULT '',
  hypothesis TEXT NOT NULL DEFAULT '',
  chain_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conversation_analysis_user_status
  ON conversation_analysis_sessions(user_id, status, created_at);
