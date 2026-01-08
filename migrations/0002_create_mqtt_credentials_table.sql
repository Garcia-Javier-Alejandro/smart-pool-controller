-- Create MQTT credentials table for storing user-specific MQTT access
CREATE TABLE IF NOT EXISTS mqtt_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mqtt_user TEXT UNIQUE NOT NULL,
  mqtt_pass TEXT NOT NULL,
  device_topic_prefix TEXT NOT NULL,
  created_at INTEGER DEFAULT (cast(unixepoch() as int)),
  updated_at INTEGER DEFAULT (cast(unixepoch() as int)),
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mqtt_credentials_user_id ON mqtt_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_credentials_mqtt_user ON mqtt_credentials(mqtt_user);
