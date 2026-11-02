ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN canceled_at TEXT;
ALTER TABLE subscriptions ADD COLUMN updated_at TEXT;
ALTER TABLE subscriptions ADD COLUMN recurring_order_reference TEXT;
ALTER TABLE subscriptions ADD COLUMN last_payment_at TEXT;
ALTER TABLE subscriptions ADD COLUMN last_provider_sync_at TEXT;

UPDATE subscriptions SET updated_at=created_at WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS subscription_payments (
  order_reference TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount_uah INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','paid','declined')),
  period_start TEXT,
  period_end TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user_created
  ON subscription_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_subscription
  ON subscription_payments(subscription_id, created_at DESC);
