CREATE TABLE IF NOT EXISTS trainer_communication_preferences (
  user_id TEXT PRIMARY KEY,
  address_form TEXT NOT NULL DEFAULT 'formal' CHECK (address_form IN ('formal','informal')),
  grammatical_gender TEXT NOT NULL DEFAULT 'neutral' CHECK (grammatical_gender IN ('neutral','masculine','feminine')),
  updated_at TEXT NOT NULL
);
