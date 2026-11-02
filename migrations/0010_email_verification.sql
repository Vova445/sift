CREATE TABLE IF NOT EXISTS email_verification_status (
  user_id TEXT PRIMARY KEY,
  verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_verification_user_expiry
  ON email_verification_tokens(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_limits (
  user_id TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at TEXT
);
