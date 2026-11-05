CREATE TABLE IF NOT EXISTS domain_index_consent (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  agreed_at TEXT,
  updated_at TEXT NOT NULL
);

-- A row is one pseudonymized, opt-in account contribution per domain.
-- No email, URL path, source quote, or raw user ID is stored here.
CREATE TABLE IF NOT EXISTS domain_index_observations (
  domain TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  clarity_score INTEGER NOT NULL CHECK (clarity_score BETWEEN 0 AND 100),
  indicators_json TEXT NOT NULL,
  report_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (domain, user_hash)
);
CREATE INDEX IF NOT EXISTS idx_domain_index_observations_recent
  ON domain_index_observations(domain, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS domain_correction_requests (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  organization TEXT NOT NULL,
  message TEXT NOT NULL,
  evidence_url TEXT,
  owner_attested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  moderator_note TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  expires_at TEXT NOT NULL,
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  owner_verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_domain_corrections_status_created
  ON domain_correction_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_corrections_domain_created
  ON domain_correction_requests(domain, created_at DESC);

CREATE TABLE IF NOT EXISTS domain_owner_responses (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  organization TEXT NOT NULL,
  response TEXT NOT NULL,
  published_at TEXT NOT NULL,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_domain_owner_responses_domain
  ON domain_owner_responses(domain, published_at DESC);
