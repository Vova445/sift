ALTER TABLE subscriptions ADD COLUMN past_due_at TEXT;
ALTER TABLE subscriptions ADD COLUMN grace_until TEXT;
ALTER TABLE subscriptions ADD COLUMN dunning_email_sent_at TEXT;
ALTER TABLE subscriptions ADD COLUMN dunning_email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN dunning_email_last_attempt_at TEXT;
ALTER TABLE subscriptions ADD COLUMN dunning_email_error TEXT;

UPDATE subscriptions
SET past_due_at = COALESCE(past_due_at, updated_at),
    grace_until = COALESCE(
      grace_until,
      strftime('%Y-%m-%dT%H:%M:%fZ', MAX(julianday(expires_at), julianday(updated_at)) + 7)
    )
WHERE status = 'past_due';

CREATE INDEX IF NOT EXISTS idx_subscriptions_dunning
  ON subscriptions(status, grace_until, dunning_email_sent_at);
