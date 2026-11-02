CREATE TABLE IF NOT EXISTS ai_daily_usage (
  day TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  reserved_tokens INTEGER NOT NULL DEFAULT 0,
  actual_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL,
  estimated_cost_micros INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_locks (
  source_hash TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_scan_created
  ON ai_usage_events(scan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_created
  ON ai_usage_events(user_id, created_at DESC);
