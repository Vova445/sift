CREATE TABLE IF NOT EXISTS subscription_radar_addresses (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_radar_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_key TEXT NOT NULL,
  service_name TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD','EUR','GBP','UAH','PLN','CAD','AUD','JPY')),
  next_charge_date TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 1 CHECK (source_count > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, service_key, next_charge_date)
);

CREATE INDEX IF NOT EXISTS idx_subscription_radar_items_user_date
  ON subscription_radar_items(user_id, next_charge_date, updated_at DESC);

CREATE TABLE IF NOT EXISTS subscription_radar_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','processed','needs_review','rejected','error')),
  reason_code TEXT,
  item_id TEXT REFERENCES subscription_radar_items(id) ON DELETE SET NULL,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (user_id, message_hash)
);

CREATE INDEX IF NOT EXISTS idx_subscription_radar_receipts_expiry
  ON subscription_radar_receipts(expires_at);

CREATE INDEX IF NOT EXISTS idx_subscription_radar_receipts_user_received
  ON subscription_radar_receipts(user_id, received_at DESC);

CREATE TABLE IF NOT EXISTS subscription_radar_reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES subscription_radar_items(id) ON DELETE CASCADE,
  charge_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  lease_until TEXT,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (item_id, charge_date)
);

CREATE INDEX IF NOT EXISTS idx_subscription_radar_reminders_retry
  ON subscription_radar_reminders(status, last_attempt_at, lease_until);
