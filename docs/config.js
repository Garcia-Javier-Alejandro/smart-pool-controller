// dashboard/config.js
// Dashboard Configuration (commit without secrets)
//
// ARCHITECTURE: Single-User (Current) → Multi-User (Future)
//
// CURRENT (Phase 1):
// - Single shared MQTT user for all dashboard instances
// - All users see same devices on topics: devices/esp32-pool-01/*
// - Suitable for: single home, single location, trusted users
//
// FUTURE (Phase 2 - Multi-User SaaS):
// - User authentication (login with personal account)
// - Backend API provides user-specific MQTT credentials
// - Topic namespacing per user: devices/{userId}/pool-01/*
// - Enables: multi-tenant deployment, access control, user isolation
// - Example: User "john" sees devices/john/pool-01/*, User "mary" sees devices/mary/pool-01/*

window.APP_CONFIG = {
  // ==================== MQTT Broker ====================
  // HiveMQ Cloud hostname (without https://)
  HIVEMQ_HOST: "1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud",

  // WebSocket Secure endpoint for browser connections
  // Port 8884 + /mqtt path (as configured in HiveMQ Cloud settings)
  MQTT_WSS_URL: "wss://1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud:8884/mqtt",

  // ==================== MQTT Authentication ====================
  // MQTT credentials - Must match broker user/pass
  // 
  // ⚠️  DEVELOPMENT/TESTING: These test credentials are committed for local testing
  // ⚠️  PRODUCTION: Replace with environment variables before deploying!
  //     Use: process.env.MQTT_USER and process.env.MQTT_PASS (or similar)
  //     Or: Use a secure backend endpoint to fetch credentials
  //
  // Do NOT commit real production credentials to git!
  MQTT_USER: "User-dashboard-01",        // Test user for development
  MQTT_PASS: "Manzana1",                 // Test password for development

  // ==================== Device Configuration ====================
  // Device identifier for topic organization
  DEVICE_ID: "esp32-pool-01",

  // ==================== MQTT Topics ====================
  // Pump Control: dashboard publishes commands, ESP32 publishes state
  TOPIC_PUMP_CMD: "devices/esp32-pool-01/pump/set",      // Values: "ON", "OFF", "TOGGLE"
  TOPIC_PUMP_STATE: "devices/esp32-pool-01/pump/state",  // Values: "ON", "OFF"

  // Valve Mode: dashboard publishes commands, ESP32 publishes state
  TOPIC_VALVE_CMD: "devices/esp32-pool-01/valve/set",    // Values: "1" (Cascada), "2" (Eyectores), "TOGGLE"
  TOPIC_VALVE_STATE: "devices/esp32-pool-01/valve/state", // Values: "1", "2"

  // WiFi Status and Control
  TOPIC_WIFI_STATE: "devices/esp32-pool-01/wifi/state",   // JSON: {status, ssid, ip, rssi, quality}
  TOPIC_WIFI_CLEAR: "devices/esp32-pool-01/wifi/clear",   // Command: "clear" - erases saved credentials

  // Timer Control and Status
  TOPIC_TIMER_CMD: "devices/esp32-pool-01/timer/set",     // JSON: {mode: 1|2, duration: seconds}
  TOPIC_TIMER_STATE: "devices/esp32-pool-01/timer/state",  // JSON: {active, remaining, mode, duration}

  // Temperature Monitoring
  TOPIC_TEMP_STATE: "devices/esp32-pool-01/temperature/state"  // Value: temperature in °C
};
