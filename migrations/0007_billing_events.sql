CREATE TABLE IF NOT EXISTS billing_events (
  event_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'wayforpay',
  order_reference TEXT,
  event_type TEXT NOT NULL,
  signature_valid INTEGER NOT NULL DEFAULT 0,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('received','processing','processed','ignored','rejected','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  lease_until TEXT,
  event_data_json TEXT NOT NULL,
  error_message TEXT,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_billing_events_order_received
  ON billing_events(order_reference, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_events_status_received
  ON billing_events(processing_status, received_at DESC);
