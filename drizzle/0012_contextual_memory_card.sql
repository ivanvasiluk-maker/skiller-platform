ALTER TABLE conversation_analysis_sessions ADD memory_pattern_id TEXT NOT NULL DEFAULT '';
ALTER TABLE conversation_analysis_sessions ADD memory_dismissed INTEGER NOT NULL DEFAULT 0;
