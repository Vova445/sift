CREATE TABLE IF NOT EXISTS payment_orders (
  order_reference TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('one', 'pro')),
  amount_uah INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UAH',
  status TEXT NOT NULL DEFAULT 'pending',
  test_mode INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created
  ON payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status_expires
  ON payment_orders(status, expires_at);
