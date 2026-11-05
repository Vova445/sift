CREATE TABLE IF NOT EXISTS savings_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('not_bought', 'canceled', 'refunded')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000),
  confirmed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, scan_id)
);

CREATE INDEX IF NOT EXISTS idx_savings_entries_user_confirmed
  ON savings_entries(user_id, confirmed_at DESC);
