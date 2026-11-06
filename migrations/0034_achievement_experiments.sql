CREATE TABLE IF NOT EXISTS achievement_experiments (
  experiment_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  progress_percent INTEGER NOT NULL DEFAULT 50 CHECK (progress_percent BETWEEN 0 AND 100),
  started_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO achievement_experiments(
  experiment_key,enabled,progress_percent,started_at,updated_at,updated_by
) VALUES (
  'badge_progress_visibility_v1',0,50,NULL,'1970-01-01T00:00:00.000Z','system'
);

CREATE TABLE IF NOT EXISTS achievement_experiment_assignments (
  experiment_key TEXT NOT NULL REFERENCES achievement_experiments(experiment_key) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('progress','control')),
  assigned_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (experiment_key,user_id)
);

CREATE INDEX IF NOT EXISTS idx_achievement_experiment_variant_assigned
  ON achievement_experiment_assignments(experiment_key,variant,assigned_at);
CREATE INDEX IF NOT EXISTS idx_achievement_experiment_expiry
  ON achievement_experiment_assignments(expires_at);
