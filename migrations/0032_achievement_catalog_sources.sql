DROP INDEX IF EXISTS idx_events_user_created;
DROP INDEX IF EXISTS idx_events_user_type_created;

ALTER TABLE events RENAME TO events_achievement_catalog_legacy;

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'analysis_completed',
    'autorenew_found',
    'subscription_canceled',
    'watchlist_added',
    'watchlist_removed',
    'translation_used',
    'cancellation_kit_used',
    'savings_confirmed',
    'savings_removed',
    'referral_completed'
  )),
  source_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, type, source_id)
);

INSERT INTO events(id,user_id,type,source_id,payload,created_at)
SELECT id,user_id,type,source_id,payload,created_at
FROM events_achievement_catalog_legacy;

DROP TABLE events_achievement_catalog_legacy;

CREATE INDEX idx_events_user_created ON events(user_id,created_at DESC);
CREATE INDEX idx_events_user_type_created ON events(user_id,type,created_at DESC);

CREATE TABLE IF NOT EXISTS referral_links (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_attributions (
  id TEXT PRIMARY KEY,
  referee_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK (referee_user_id <> referrer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer_completed
  ON referral_attributions(referrer_user_id,completed_at,created_at DESC);
