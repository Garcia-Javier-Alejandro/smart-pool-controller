-- Create devices table for managing multiple devices per user
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  device_id TEXT UNIQUE NOT NULL,
  mqtt_topic_prefix TEXT NOT NULL,
  device_type TEXT DEFAULT 'pool-controller',
  firmware_version TEXT,
  created_at INTEGER DEFAULT (cast(unixepoch() as int)),
  updated_at INTEGER DEFAULT (cast(unixepoch() as int)),
  last_seen INTEGER,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_mqtt_topic_prefix ON devices(mqtt_topic_prefix);
