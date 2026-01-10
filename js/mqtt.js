/**
 * MQTT Module for Pool Control
 * Handles MQTT connection, subscription, publishing, and event management.
 * Requires mqtt.js library (global mqtt object)
 */

const MQTTModule = (() => {
  let client = null;
  let pumpState = "UNKNOWN";   // "ON" | "OFF" | "UNKNOWN"
  let valveMode = "UNKNOWN";   // "1" | "2" | "UNKNOWN"
  let wifiState = null;        // WiFi status object
  let timerState = null;       // Timer status object
  
  let onPumpStateChange = null;   // Callback when pump state changes
  let onValveStateChange = null;  // Callback when valve mode changes
  let onConnected = null;         // Callback when connected
  let onDisconnected = null;      // Callback when disconnected
  let onWiFiEvent = null;         // Callback for WiFi connection events
  let onWiFiStateChange = null;   // Callback for WiFi status updates
  let onTimerStateChange = null;  // Callback for Timer status updates
  let onTemperatureChange = null; // Callback for Temperature updates

  /**
   * Register callbacks for MQTT events
   */
  function onEvents(pumpChangeCb, valveChangeCb, connectedCb, disconnectedCb, wifiEventCb, wifiStateCb, timerStateCb, tempChangeCb) {
    onPumpStateChange = pumpChangeCb;
    onValveStateChange = valveChangeCb;
    onConnected = connectedCb;
    onDisconnected = disconnectedCb;
    onWiFiEvent = wifiEventCb || null;
    onWiFiStateChange = wifiStateCb || null;
    onTimerStateChange = timerStateCb || null;
    onTemperatureChange = tempChangeCb || null;
  }

  /**
   * Connect to MQTT broker
   */
  function connect(brokerUrl, username, password, topics, deviceId, logFn) {
    if (client) {
      try {
        client.end(true);
      } catch (_) {}
      client = null;
    }

    const clientId = "dashboard-" + Math.random().toString(16).slice(2, 10);

    logFn(`Device: ${deviceId}`);
    logFn(`WSS: ${brokerUrl}`);
    logFn(`Topics: pump=${topics.pumpState} | valve=${topics.valveState} | wifi=${topics.wifiState} | timer=${topics.timerState}`);
    logFn("Conectando…");

    client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      keepalive: 60,
    });

    // Connect event
    client.on("connect", () => {
      logFn("✓ Conectado al broker como " + clientId);

      client.subscribe(topics.pumpState, { qos: 0 }, (err) => {
        if (!err) {
          logFn("✓ Suscripto a pump/state");
        } else {
          logFn("✗ Error suscripción pump: " + err.message);
        }
      });

      client.subscribe(topics.valveState, { qos: 0 }, (err) => {
        if (!err) {
          logFn("✓ Suscripto a valve/state");
        } else {
          logFn("✗ Error suscripción valve: " + err.message);
        }
      });

      client.subscribe(topics.wifiState, { qos: 0 }, (err) => {
        if (!err) {
          logFn("✓ Suscripto a wifi/state");
        } else {
          logFn("✗ Error suscripción wifi: " + err.message);
        }
      });

      client.subscribe(topics.timerState, { qos: 0 }, (err) => {
        if (!err) {
          logFn("✓ Suscripto a timer/state");
        } else {
          logFn("✗ Error suscripción timer: " + err.message);
        }
      });

      client.subscribe(topics.tempState, { qos: 0 }, (err) => {
        if (!err) {
          logFn("✓ Suscripto a temperature/state");
        } else {
          logFn("✗ Error suscripción temperature: " + err.message);
        }
      });

      if (onConnected) onConnected();
    });

    // Reconnect event
    client.on("reconnect", () => {
      logFn("⟳ Intentando reconectar...");
    });

    // Close event
    client.on("close", () => {
      logFn("⚠ Conexión cerrada");
      if (onDisconnected) onDisconnected();
    });

    // Offline event
    client.on("offline", () => {
      logFn("⚠ Cliente offline");
      if (onDisconnected) onDisconnected();
    });

    // Error event
    client.on("error", (err) => {
      logFn("✗ Error MQTT: " + err.message);
    });

    // Message received
    client.on("message", (topic, payload) => {
      const msg = payload.toString().trim();
      const msgUpper = msg.toUpperCase();
      
      if (topic === topics.pumpState) {
        logFn(`Pump estado: ${msgUpper}`);
        if (msgUpper === "ON" || msgUpper === "OFF") {
          pumpState = msgUpper;
          if (onPumpStateChange) onPumpStateChange(msgUpper);
        }
      } else if (topic === topics.valveState) {
        logFn(`Valve modo: ${msg}`);
        if (msg === "1" || msg === "2") {
          valveMode = msg;
          if (onValveStateChange) onValveStateChange(msg);
        }
      } else if (topic === topics.wifiState) {
        try {
          wifiState = JSON.parse(msg);
          logFn(`WiFi: ${wifiState.status} ${wifiState.ssid || ''} (${wifiState.rssi || 0} dBm)`);
          if (onWiFiStateChange) onWiFiStateChange(wifiState);
        } catch (e) {
          logFn(`✗ Error parseando WiFi status: ${e.message}`);
        }
      } else if (topic === topics.timerState) {
        try {
          timerState = JSON.parse(msg);
          logFn(`Timer: ${timerState.active ? 'activo' : 'inactivo'} (${timerState.remaining || 0}s restantes)`);
          if (onTimerStateChange) onTimerStateChange(timerState);
        } catch (e) {
          logFn(`✗ Error parseando Timer status: ${e.message}`);
        }
      } else if (topic === topics.tempState) {
        const temperature = parseFloat(msg);
        if (!isNaN(temperature)) {
          logFn(`Temperatura: ${temperature.toFixed(1)}°C`);
          if (onTemperatureChange) onTemperatureChange(temperature);
        } else {
          logFn(`✗ Error parseando temperatura: ${msg}`);
        }
      }
    });
  }

  /**
   * Disconnect from MQTT broker
   */
  function disconnect() {
    if (client) {
      try {
        client.end(true);
      } catch (_) {}
      client = null;
    }
  }

  /**
   * Publish a command to MQTT
   * @param {string} command - "ON"/"OFF" for pump, "1"/"2" for valve
   * @param {string} topic - Topic to publish to
   * @param {Function} logFn - Function to call for logging
   */
  function publish(command, topic, logFn) {
    if (!client || !client.connected) {
      logFn("✗ No conectado al broker");
      return;
    }

    client.publish(topic, command, { qos: 0 }, (err) => {
      if (err) {
        logFn(`✗ Publish error: ${err.message}`);
      } else {
        logFn(`✓ Comando enviado: ${command}`);
      }
    });
  }

  /**
   * Check if connected to broker
   */
  function isConnected() {
    return client && client.connected;
  }

  return {
    onEvents,
    connect,
    disconnect,
    publish,
    isConnected,
  };
})();
