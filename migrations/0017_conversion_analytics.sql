ALTER TABLE payment_orders ADD COLUMN analytics_session_hash TEXT;

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('visit', 'analyze', 'signup', 'paywall', 'pay')),
  created_at TEXT NOT NULL,
  UNIQUE(session_hash, stage)
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON analytics_events(created_at);
