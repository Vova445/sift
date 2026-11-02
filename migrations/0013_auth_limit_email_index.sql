CREATE TABLE IF NOT EXISTS auth_login_limit_email_keys (
  email_hash TEXT NOT NULL,
  key_hash TEXT PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_auth_login_email_keys
  ON auth_login_limit_email_keys(email_hash);
