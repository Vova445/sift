CREATE TABLE IF NOT EXISTS scan_usage (
  owner_key TEXT NOT NULL,
  month TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_key, month)
);

CREATE TABLE IF NOT EXISTS translation_cache (
  source_hash TEXT PRIMARY KEY,
  translation TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, day)
);
