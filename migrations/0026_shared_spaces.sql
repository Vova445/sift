CREATE TABLE IF NOT EXISTS shared_spaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','closed')),
  test_mode INTEGER NOT NULL DEFAULT 0 CHECK (test_mode IN (0,1)),
  expires_at TEXT,
  last_payment_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_spaces_owner_updated
  ON shared_spaces(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS shared_space_members (
  space_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','member')),
  invited_by TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_space_members_user
  ON shared_space_members(user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS shared_space_invites (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  max_uses INTEGER NOT NULL CHECK (max_uses BETWEEN 1 AND 4),
  uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count BETWEEN 0 AND max_uses),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_space_invites_space_expiry
  ON shared_space_invites(space_id, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS shared_space_invite_acceptances (
  invite_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  use_number INTEGER NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (invite_id, user_id),
  UNIQUE (invite_id, use_number)
);

CREATE TABLE IF NOT EXISTS shared_space_items (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  title TEXT NOT NULL,
  service_url TEXT,
  amount_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'UAH' CHECK (currency IN ('UAH','USD','EUR','GBP')),
  next_charge_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceling','canceled')),
  note TEXT NOT NULL DEFAULT '',
  assigned_to_user_id TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_space_items_space_date
  ON shared_space_items(space_id, next_charge_date, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_space_items_assignee
  ON shared_space_items(space_id, assigned_to_user_id);

CREATE TABLE IF NOT EXISTS shared_space_orders (
  order_reference TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  amount_uah INTEGER NOT NULL CHECK (amount_uah = 119),
  currency TEXT NOT NULL DEFAULT 'UAH' CHECK (currency = 'UAH'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','declined','expired')),
  test_mode INTEGER NOT NULL DEFAULT 0 CHECK (test_mode IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  period_start TEXT,
  period_end TEXT
);

CREATE INDEX IF NOT EXISTS idx_shared_space_orders_owner_created
  ON shared_space_orders(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_space_orders_space_created
  ON shared_space_orders(space_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_space_orders_status_expiry
  ON shared_space_orders(status, expires_at);

CREATE TABLE IF NOT EXISTS shared_space_legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  order_reference TEXT NOT NULL UNIQUE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  refund_version TEXT NOT NULL,
  terms_accepted INTEGER NOT NULL CHECK (terms_accepted = 1),
  privacy_acknowledged INTEGER NOT NULL CHECK (privacy_acknowledged = 1),
  refund_accepted INTEGER NOT NULL CHECK (refund_accepted = 1),
  immediate_performance INTEGER NOT NULL CHECK (immediate_performance = 1),
  accepted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_space_legal_user_accepted
  ON shared_space_legal_acceptances(user_id, accepted_at DESC);
