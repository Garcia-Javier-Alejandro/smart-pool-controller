-- Create events table for telemetry data
-- Stores pump/valve state changes for history charts and analytics
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  ts INTEGER NOT NULL,           -- Timestamp in milliseconds (epoch)
  state TEXT NOT NULL,            -- "ON" or "OFF"
  valve_id INTEGER DEFAULT 1,    -- 1 (Cascada) or 2 (Eyectores)
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);

-- Index for fast device-specific queries (used by /api/history)
CREATE INDEX IF NOT EXISTS idx_events_device_ts ON events(device_id, ts);

-- Index for cleanup operations (delete old events)
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
