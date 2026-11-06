DROP INDEX IF EXISTS idx_user_achievements_user_key;
DROP INDEX IF EXISTS idx_user_achievements_user_issued;

ALTER TABLE user_achievements RENAME TO user_achievements_rebuild;

CREATE TABLE user_achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, key)
);

INSERT OR IGNORE INTO user_achievements(user_id,key,unlocked_at,progress)
SELECT user_id,key,unlocked_at,progress
FROM user_achievements_rebuild;

DROP TABLE user_achievements_rebuild;

CREATE UNIQUE INDEX idx_user_achievements_user_key
  ON user_achievements(user_id, key);
