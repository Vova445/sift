CREATE TABLE IF NOT EXISTS legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('signup', 'checkout')),
  plan TEXT CHECK (plan IS NULL OR plan IN ('one', 'pro')),
  order_reference TEXT UNIQUE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  refund_version TEXT,
  terms_accepted INTEGER NOT NULL CHECK (terms_accepted IN (0, 1)),
  privacy_acknowledged INTEGER NOT NULL CHECK (privacy_acknowledged IN (0, 1)),
  refund_accepted INTEGER NOT NULL DEFAULT 0 CHECK (refund_accepted IN (0, 1)),
  immediate_performance INTEGER NOT NULL DEFAULT 0 CHECK (immediate_performance IN (0, 1)),
  accepted_at TEXT NOT NULL,
  CHECK (context != 'signup' OR (plan IS NULL AND order_reference IS NULL AND refund_version IS NULL)),
  CHECK (context != 'checkout' OR (plan IS NOT NULL AND order_reference IS NOT NULL AND refund_version IS NOT NULL AND refund_accepted = 1 AND immediate_performance = 1))
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_accepted
  ON legal_acceptances(user_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_scans_guest_retention
  ON scans(created_at) WHERE user_id IS NULL;
