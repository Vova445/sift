CREATE TABLE IF NOT EXISTS public_verdict_shares (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  decision TEXT NOT NULL CHECK (decision IN ('buy', 'wait', 'close')),
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_verdict_active_scan
  ON public_verdict_shares(user_id, scan_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_public_verdict_user_created
  ON public_verdict_shares(user_id, created_at DESC);
