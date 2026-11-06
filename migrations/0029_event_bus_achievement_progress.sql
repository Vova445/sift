CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'analysis_completed',
    'autorenew_found',
    'subscription_canceled',
    'watchlist_added',
    'translation_used',
    'cancellation_kit_used'
  )),
  source_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_events_user_created
  ON events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_type_created
  ON events(user_id, type, created_at DESC);

INSERT OR IGNORE INTO events(id, user_id, type, source_id, payload, created_at)
SELECT 'legacy-analysis:' || id, user_id, 'analysis_completed', id,
       json_object('scanId', id, 'score', score), created_at
FROM scans
WHERE user_id IS NOT NULL;

INSERT OR IGNORE INTO events(id, user_id, type, source_id, payload, created_at)
SELECT 'legacy-renewal-scan:' || s.id, s.user_id, 'autorenew_found', s.id,
       json_object('scanId', s.id), s.created_at
FROM scans AS s
WHERE s.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM json_each(CASE WHEN json_valid(s.result_json) THEN json_extract(s.result_json, '$.findings') ELSE '[]' END) AS finding
    WHERE json_extract(finding.value, '$.kind') = 'renewal'
      AND json_extract(finding.value, '$.confidence') <> 'low'
      AND trim(COALESCE(json_extract(finding.value, '$.evidence'), '')) <> ''
  );

INSERT OR IGNORE INTO events(id, user_id, type, source_id, payload, created_at)
SELECT 'legacy-event:' || id, user_id,
       CASE event_type WHEN 'analysis_saved' THEN 'analysis_completed' ELSE event_type END,
       source_id,
       json_object('sourceId', source_id),
       created_at
FROM user_achievement_events;

INSERT OR IGNORE INTO events(id, user_id, type, source_id, payload, created_at)
SELECT 'legacy-renewal:' || user_id, user_id, 'autorenew_found',
       COALESCE(json_extract(details_json, '$.sourceId'), 'legacy-renewal:' || user_id),
       json_object('sourceId', COALESCE(json_extract(details_json, '$.sourceId'), 'legacy-renewal:' || user_id)),
       issued_at
FROM user_achievements
WHERE badge_key = 'renewal_spotted';

DROP INDEX IF EXISTS idx_user_achievements_user_issued;
ALTER TABLE user_achievements RENAME TO user_achievements_legacy;

CREATE TABLE user_achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, key)
);

CREATE UNIQUE INDEX idx_user_achievements_user_key
  ON user_achievements(user_id, key);

INSERT INTO user_achievements(user_id,key,unlocked_at,progress)
SELECT user_id,badge_key,issued_at,
       json_object('current',1,'goal',1,'sourceId',json_extract(details_json,'$.sourceId'))
FROM user_achievements_legacy;

DROP TABLE user_achievements_legacy;
