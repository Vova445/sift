CREATE TABLE IF NOT EXISTS support_feature_flags (
  flag_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  order_reference TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_audit_created
  ON support_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_audit_target
  ON support_audit_log(target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_refunds (
  id TEXT PRIMARY KEY,
  order_reference TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  amount_uah INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','pending','refunded','declined','failed')),
  provider_reason_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_refunds_one_open_per_order
  ON support_refunds(order_reference)
  WHERE status IN ('processing','pending','refunded');
CREATE INDEX IF NOT EXISTS idx_support_refunds_order_created
  ON support_refunds(order_reference, created_at DESC);

INSERT OR IGNORE INTO support_feature_flags(flag_key, enabled, description, updated_at, updated_by)
VALUES
  ('ai_translation', 1, 'AI-переклад доказів у звітах', '1970-01-01T00:00:00.000Z', 'system'),
  ('email_reminders', 1, 'Email-нагадування про дедлайни', '1970-01-01T00:00:00.000Z', 'system');
