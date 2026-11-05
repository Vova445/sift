CREATE TABLE IF NOT EXISTS tos_monitor_subscriptions (
  watchlist_id TEXT PRIMARY KEY REFERENCES watchlist(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  baseline_snapshot_json TEXT NOT NULL,
  checked_at TEXT,
  next_check_at TEXT NOT NULL,
  lease_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tos_monitor_due
  ON tos_monitor_subscriptions(enabled, next_check_at, lease_until);
CREATE INDEX IF NOT EXISTS idx_tos_monitor_user
  ON tos_monitor_subscriptions(user_id, enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS tos_monitor_events (
  id TEXT PRIMARY KEY,
  watchlist_id TEXT NOT NULL REFERENCES tos_monitor_subscriptions(watchlist_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  page_title TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  changes_json TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  lease_until TEXT,
  sent_at TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_tos_monitor_event_retry
  ON tos_monitor_events(delivery_status, last_attempt_at, lease_until);
CREATE INDEX IF NOT EXISTS idx_tos_monitor_event_user
  ON tos_monitor_events(user_id, detected_at DESC);

INSERT OR IGNORE INTO support_feature_flags(flag_key, enabled, description, updated_at, updated_by)
VALUES ('tos_monitoring', 1, 'Щотижневе відстеження змін умов для Pro', '1970-01-01T00:00:00.000Z', 'system');

