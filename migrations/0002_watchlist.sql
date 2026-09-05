CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'considering',
  note TEXT NOT NULL DEFAULT '',
  review_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, scan_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_updated ON watchlist(user_id, updated_at DESC);
