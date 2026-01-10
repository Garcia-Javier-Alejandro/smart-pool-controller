/**
 * MQTT Module
 * Handles MQTT connection, subscription, publishing, and event management.
 * Requires mqtt.js library (global mqtt object)
 */

const MQTTModule = (() => {
  let client = null;
  let valve1State = "UNKNOWN"; // "ON" | "OFF" | "UNKNOWN"
  let valve2State = "UNKNOWN"; // "ON" | "OFF" | "UNKNOWN"
  let onValve1StateChange = null; // Callback when valve1 state changes
  let onValve2StateChange = null; // Callback when valve2 state changes
  let onConnected = null; // Callback when connected
  let onDisconnected = null; // Callback when disconnected

  /**
   * Register callbacks for MQTT events
   * @param {Function} valve1ChangeCb - Callback(state) when valve1 state changes
   * @param {Function} valve2ChangeCb - Callback(state) when valve2 state changes
   * @param {Function} connectedCb - Callback() when connected
   * @param {Function} disconnectedCb - Callback() when disconnected
   */
  function onEvents(valve1ChangeCb, valve2ChangeCb, connectedCb, disconnectedCb) {
    onValve1StateChange = valve1ChangeCb;
    onValve2StateChange = valve2ChangeCb;
    onConnected = connectedCb;
    onDisconnected = disconnectedCb;
  }

  /**
   * Connect to MQTT broker
   * @param {string} brokerUrl - WSS URL of MQTT broker
   * @param {string} username - MQTT username
   * @param {string} password - MQTT password
   * @param {Object} topics - { cmd: string, state: string }
   * @param {string} deviceId - Device ID for logging
   * @param {Object} config - { HIVEMQ_HOST }
   * @param {Function} logFn - Function to call for logging
   */
  function connect(brokerUrl, username, password, topics, deviceId, config, logFn) {
    if (client) {
      try {
        client.end(true);
      } catch (_) {}
      client = null;
    }

    const clientId = "dashboard-" + Math.random().toString(16).slice(2, 10);

    logFn(`Broker: ${config.HIVEMQ_HOST || "(host)"}${deviceId ? " | " + deviceId : ""}`);
    logFn(`WSS: ${brokerUrl}`);
    logFn(`Topics: valve1=${topics.valve1State} | valve2=${topics.valve2State}`);
    logFn("Conectando…");

    client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      clean: true,
      reconnectPeriod: 5000, // Increased from 2s to 5s
      connectTimeout: 30000, // Increased from 8s to 30s
      keepalive: 60,
    });

    // Connect event
    client.on("connect", () => {
      logFn("Conectado al broker como " + clientId);

      client.subscribe(topics.valve1State, { qos: 0 }, (err) => {
        if (!err) {
          logFn("Suscripto a " + topics.valve1State);
        } else {
          logFn("Error al suscribirse: " + err.message);
        }
      });

      client.subscribe(topics.valve2State, { qos: 0 }, (err) => {
        if (!err) {
          logFn("Suscripto a " + topics.valve2State);
        } else {
          logFn("Error al suscribirse: " + err.message);
        }
      });

      if (onConnected) onConnected();
    });

    // Reconnect event
    client.on("reconnect", () => {
      logFn("Intentando reconectar...");
    });

    // Close event
    client.on("close", () => {
      logFn("Conexión cerrada");
      if (onDisconnected) onDisconnected();
    });

    // Offline event
    client.on("offline", () => {
      logFn("Cliente offline");
      if (onDisconnected) onDisconnected();
    });

    // Error event
    client.on("error", (err) => {
      logFn("Error MQTT: " + err.message);
    });

    // Message received
    client.on("message", (topic, payload) => {
      const msg = payload.toString().trim().toUpperCase();
      
      if (topic === topics.valve1State) {
        logFn("Válvula 1 estado: " + msg);
        if (msg === "ON" || msg === "OFF") {
          valve1State = msg;
          if (onValve1StateChange) onValve1StateChange(msg);
        }
      } else if (topic === topics.valve2State) {
        logFn("Válvula 2 estado: " + msg);
        if (msg === "ON" || msg === "OFF") {
          valve2State = msg;
          if (onValve2StateChange) onValve2StateChange(msg);
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
   * @param {string} command - "ON" or "OFF"
   * @param {string} topic - Topic to publish to
   * @param {Function} logFn - Function to call for logging
   */
  function publish(command, topic, logFn) {
    if (!client || !client.connected) {
      logFn("No conectado al broker, no se envía comando");
      return;
    }

    client.publish(topic, command, { qos: 0 }, (err) => {
      if (err) {
        logFn("Error al publicar comando: " + err.message);
      } else {
        logFn("Comando enviado: " + command);
      }
    });
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  function isConnected() {
    return !!(client && client.connected);
  }

  /**
   * Get last known valve states
   * @returns {Object} { valve1: "ON"|"OFF"|"UNKNOWN", valve2: "ON"|"OFF"|"UNKNOWN" }
   */
  function getLastStates() {
    return { valve1: valve1State, valve2: valve2State };
  }

  return {
    onEvents,
    connect,
    disconnect,
    publish,
    isConnected,
    getLastStates,
  };
})();
