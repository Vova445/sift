CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_key TEXT NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('one_credit','pro_discount_50','priority_alerts')),
  status TEXT NOT NULL CHECK (status IN ('available','reserved','redeemed','expired','capped')),
  quarter_key TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  reserved_reference TEXT,
  reserved_until TEXT,
  redeemed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (user_id, reward_key)
);

CREATE INDEX IF NOT EXISTS idx_rewards_user_status_expiry
  ON rewards(user_id,status,reward_type,expires_at);
CREATE INDEX IF NOT EXISTS idx_rewards_quarter_type
  ON rewards(user_id,quarter_key,reward_type,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rewards_reserved_reference
  ON rewards(reserved_reference) WHERE reserved_reference IS NOT NULL;

ALTER TABLE payment_orders ADD COLUMN reward_id TEXT;

ALTER TABLE referral_links ADD COLUMN owner_ip_hash TEXT;
ALTER TABLE referral_links ADD COLUMN owner_device_hash TEXT;
ALTER TABLE referral_attributions ADD COLUMN referee_email_hash TEXT;
ALTER TABLE referral_attributions ADD COLUMN referee_device_hash TEXT;
ALTER TABLE referral_attributions ADD COLUMN referee_ip_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attributions_email_hash
  ON referral_attributions(referee_email_hash) WHERE referee_email_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attributions_device_hash
  ON referral_attributions(referee_device_hash) WHERE referee_device_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attributions_ip_hash
  ON referral_attributions(referee_ip_hash) WHERE referee_ip_hash IS NOT NULL;
