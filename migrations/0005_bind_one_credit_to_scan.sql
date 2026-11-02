ALTER TABLE scans ADD COLUMN one_subscription_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_one_credit_unique
  ON scans(one_subscription_id)
  WHERE one_subscription_id IS NOT NULL;
