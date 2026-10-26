CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,user_id TEXT UNIQUE,pseudonym TEXT,status TEXT NOT NULL DEFAULT 'requested',created_at TEXT NOT NULL,completed_at TEXT
);
CREATE TABLE IF NOT EXISTS group_requests (
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL,offer_id TEXT NOT NULL,contact TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'requested',
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL,amount_eur INTEGER,confirmation_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS group_one_active_per_offer ON group_requests(user_id,offer_id) WHERE status IN ('requested','contacted','confirmed');
