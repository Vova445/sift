CREATE TABLE IF NOT EXISTS auth_password_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'change', 'delete')),
  nonce TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_password_challenges_email_expiry
  ON auth_password_challenges(email, expires_at DESC);
