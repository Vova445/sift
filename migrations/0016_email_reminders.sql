CREATE TABLE IF NOT EXISTS email_reminder_preferences (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_reminder_unsubscribe_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_reminder_unsubscribe_user
  ON email_reminder_unsubscribe_tokens(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_reminder_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  watchlist_id TEXT NOT NULL,
  review_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  lease_until TEXT,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(watchlist_id, review_at)
);
CREATE INDEX IF NOT EXISTS idx_email_reminder_delivery_retry
  ON email_reminder_deliveries(status, last_attempt_at, lease_until);
CREATE INDEX IF NOT EXISTS idx_email_reminder_delivery_user
  ON email_reminder_deliveries(user_id, created_at DESC);
