CREATE TABLE IF NOT EXISTS deleted_billing_refs (
  reference_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deleted_billing_refs_expiry
  ON deleted_billing_refs(expires_at);
