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
