CREATE TABLE IF NOT EXISTS user_achievement_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('analysis_saved', 'cancellation_kit_used')),
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, event_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievement_events_user_created
  ON user_achievement_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL CHECK (badge_key IN ('first_analysis', 'renewal_spotted', 'cancellation_kit_used', 'streak_3_days', 'streak_7_days')),
  issued_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_issued
  ON user_achievements(user_id, issued_at DESC);
