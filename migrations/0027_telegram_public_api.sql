CREATE TABLE IF NOT EXISTS developer_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_developer_api_keys_user_created
  ON developer_api_keys(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user_created
  ON telegram_link_codes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_accounts (
  telegram_user_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  first_name TEXT,
  linked_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_accounts_user
  ON telegram_accounts(user_id);

CREATE TABLE IF NOT EXISTS telegram_group_authorizations (
  chat_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  linked_telegram_user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  linked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_groups_owner
  ON telegram_group_authorizations(owner_user_id, linked_at DESC);

CREATE TABLE IF NOT EXISTS telegram_bot_updates (
  update_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('processing','processed','failed')),
  lease_until INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_bot_updates_status_lease
  ON telegram_bot_updates(status, lease_until);
