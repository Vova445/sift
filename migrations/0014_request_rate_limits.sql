CREATE TABLE IF NOT EXISTS request_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_expires
  ON request_rate_limits(expires_at);
