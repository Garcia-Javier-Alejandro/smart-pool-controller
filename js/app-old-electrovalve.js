/**
 * Main Application Module
 * Orchestrates all components: UI state, MQTT, history, and logging.
 * This is the entry point for the dashboard.
 */

const AppModule = (() => {
  // UI state
  let valve1State = "UNKNOWN"; // "ON" | "OFF" | "UNKNOWN"
  let valve2State = "UNKNOWN"; // "ON" | "OFF" | "UNKNOWN"

  // Cached DOM elements
  let elements = {};

  /**
   * Initialize the entire application
   * Requires APP_CONFIG to be available from config.js
   */
  async function init() {
    // Validate APP_CONFIG
    if (!window.APP_CONFIG) {
      alert("APP_CONFIG no está definido. ¿Incluiste config.js?");
      throw new Error("APP_CONFIG no definido");
    }

    const { MQTT_WSS_URL, TOPIC_VALVE1_CMD, TOPIC_VALVE1_STATE, TOPIC_VALVE2_CMD, TOPIC_VALVE2_STATE, HIVEMQ_HOST, DEVICE_ID } =
      window.APP_CONFIG;
    if (!MQTT_WSS_URL || !TOPIC_VALVE1_CMD || !TOPIC_VALVE1_STATE || !TOPIC_VALVE2_CMD || !TOPIC_VALVE2_STATE) {
      alert("APP_CONFIG incompleto: falta configuración de topics");
      throw new Error("APP_CONFIG incompleto");
    }

    // Cache all required DOM elements
    cacheElements();

    // Initialize logging module
    LogModule.init(
      elements.logBox,
      elements.btnLogToggle,
      elements.btnLogClear
    );

    // Initialize history module
    HistoryModule.init(
      elements.historyChart,
      elements.historyHint,
      elements.btnHistoryRefresh,
      elements.historyLast
    );

    // Setup MQTT event callbacks
    setupMQTTEvents();

    // Wire up UI event listeners
    wireUIEvents();

    // Load stored credentials
    loadStoredCredentials();

    // Initialize UI state
    setValve1State("UNKNOWN");
    setValve2State("UNKNOWN");
    disconnectUI();

    // Load initial history
    await HistoryModule.load(
      "24h",
      DEVICE_ID || "esp32-01",
      (msg) => LogModule.append(msg)
    );

    // Auto-connect if credentials are available
    if (elements.userInput.value && elements.passInput.value) {
      connectMQTT(
        elements.userInput.value.trim(),
        elements.passInput.value,
        MQTT_WSS_URL,
        { HIVEMQ_HOST, DEVICE_ID }
      );
    } else {
      LogModule.append("Ingresá credenciales MQTT y presioná Conectar");
    }

    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      HistoryModule.cleanup();
      MQTTModule.disconnect();
    });
  }

  /**
   * Cache all required DOM elements at startup
   * Maps HTML IDs to camelCase properties
   */
  function cacheElements() {
    const mapping = {
      "valve1-dot": "valve1Dot",
      "valve1-status": "valve1Status",
      "valve2-dot": "valve2Dot",
      "valve2-status": "valve2Status",
      "conn-text": "connText",
      "btn-valve1": "btnValve1",
      "btn-valve2": "btnValve2",
      "log-box": "logBox",
      "mqtt-user": "userInput",
      "mqtt-pass": "passInput",
      "btn-connect": "btnConnect",
      "login-card": "loginCard",
      "btn-log-toggle": "btnLogToggle",
      "btn-log-clear": "btnLogClear",
      "history-box": "historyBox",
      "btn-history-refresh": "btnHistoryRefresh",
      "history-last": "historyLast",
      "historyChart": "historyChart",
      "historyHint": "historyHint",
    };

    const missing = [];
    for (const [id, key] of Object.entries(mapping)) {
      const el = document.getElementById(id);
      if (!el) missing.push(id);
      elements[key] = el;
    }

    // Cache range buttons (NodeList)
    elements.rangeButtons = document.querySelectorAll(".range-btn");

    if (missing.length > 0) {
      console.warn("Missing DOM elements:", missing);
    }
  }

  /**
   * Setup MQTT event callbacks
   */
  function setupMQTTEvents() {
    MQTTModule.onEvents(
      // onValve1StateChange callback
      (state) => {
        setValve1State(state);
        HistoryModule.scheduleRefresh(800);
      },
      // onValve2StateChange callback
      (state) => {
        setValve2State(state);
        HistoryModule.scheduleRefresh(800);
      },
      // onConnected callback
      () => {
        connectUI();
      },
      // onDisconnected callback
      () => {
        disconnectUI();
      }
    );
  }

  /**
   * Wire up UI event listeners
   */
  function wireUIEvents() {
    // Time range selector buttons
    if (elements.rangeButtons) {
      elements.rangeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const range = btn.getAttribute("data-range");
          elements.rangeButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          HistoryModule.load(
            range,
            window.APP_CONFIG.DEVICE_ID || "esp32-01",
            LogModule.append
          );
        });
      });
    }

    // Connect button
    if (elements.btnConnect) {
      elements.btnConnect.addEventListener("click", () => {
        const u = elements.userInput.value.trim();
        const p = elements.passInput.value;
        if (!u || !p) {
          LogModule.append("Completá username y password");
          return;
        }
        saveStoredCredentials(u, p);
        connectMQTT(
          u,
          p,
          window.APP_CONFIG.MQTT_WSS_URL,
          {
            HIVEMQ_HOST: window.APP_CONFIG.HIVEMQ_HOST,
            DEVICE_ID: window.APP_CONFIG.DEVICE_ID,
          }
        );
      });
    }

    // Valve 1 toggle button
    if (elements.btnValve1) {
      elements.btnValve1.addEventListener("click", () => {
        const newState = valve1State === "ON" ? "OFF" : "ON";
        const action = newState === "ON" ? "Abriendo" : "Cerrando";
        LogModule.append(`${action} Válvula 1...`);
        MQTTModule.publish(
          newState,
          window.APP_CONFIG.TOPIC_VALVE1_CMD,
          (msg) => LogModule.append(msg)
        );
      });
    }

    // Valve 2 toggle button
    if (elements.btnValve2) {
      elements.btnValve2.addEventListener("click", () => {
        const newState = valve2State === "ON" ? "OFF" : "ON";
        const action = newState === "ON" ? "Abriendo" : "Cerrando";
        LogModule.append(`${action} Válvula 2...`);
        MQTTModule.publish(
          newState,
          window.APP_CONFIG.TOPIC_VALVE2_CMD,
          (msg) => LogModule.append(msg)
        );
      });
    }
  }

  /**
   * Connect to MQTT broker
   */
  function connectMQTT(username, password, brokerUrl, config) {
    MQTTModule.connect(
      brokerUrl,
      username,
      password,
      { 
        valve1State: window.APP_CONFIG.TOPIC_VALVE1_STATE,
        valve2State: window.APP_CONFIG.TOPIC_VALVE2_STATE
      },
      config.DEVICE_ID,
      config,
      (msg) => LogModule.append(msg)
    );
  }

  /**
   * Update valve 1 state display
   */
  function setValve1State(state) {
    valve1State = state;

    if (elements.valve1Dot) {
      if (state === "ON") {
        elements.valve1Dot.className = "dot on";
      } else if (state === "OFF") {
        elements.valve1Dot.className = "dot off";
      } else {
        elements.valve1Dot.className = "dot";
      }
    }

    if (elements.valve1Status) {
      if (state === "ON") {
        elements.valve1Status.textContent = "ABIERTA";
      } else if (state === "OFF") {
        elements.valve1Status.textContent = "CERRADA";
      } else {
        elements.valve1Status.textContent = "DESCONOCIDO";
      }
    }

    // Update button color and text based on state
    if (elements.btnValve1) {
      if (state === "ON") {
        elements.btnValve1.classList.remove("btn-on");
        elements.btnValve1.classList.add("btn-off");
        elements.btnValve1.textContent = "Cerrar válvula 1";
      } else {
        elements.btnValve1.classList.remove("btn-off");
        elements.btnValve1.classList.add("btn-on");
        elements.btnValve1.textContent = "Abrir válvula 1";
      }
    }

    updateButtonStates();
  }

  /**
   * Update valve 2 state display
   */
  function setValve2State(state) {
    valve2State = state;

    if (elements.valve2Dot) {
      if (state === "ON") {
        elements.valve2Dot.className = "dot on";
      } else if (state === "OFF") {
        elements.valve2Dot.className = "dot off";
      } else {
        elements.valve2Dot.className = "dot";
      }
    }

    if (elements.valve2Status) {
      if (state === "ON") {
        elements.valve2Status.textContent = "ABIERTA";
      } else if (state === "OFF") {
        elements.valve2Status.textContent = "CERRADA";
      } else {
        elements.valve2Status.textContent = "DESCONOCIDO";
      }
    }

    // Update button color and text based on state
    if (elements.btnValve2) {
      if (state === "ON") {
        elements.btnValve2.classList.remove("btn-on");
        elements.btnValve2.classList.add("btn-off");
        elements.btnValve2.textContent = "Cerrar válvula 2";
      } else {
        elements.btnValve2.classList.remove("btn-off");
        elements.btnValve2.classList.add("btn-on");
        elements.btnValve2.textContent = "Abrir válvula 2";
      }
    }

    updateButtonStates();
  }

  /**
   * Update button enabled/disabled states based on connection
   */
  function updateButtonStates() {
    const connected = MQTTModule.isConnected();

    if (elements.btnValve1) {
      elements.btnValve1.disabled = !connected;
    }
    if (elements.btnValve2) {
      elements.btnValve2.disabled = !connected;
    }
  }

  /**
   * Update UI for connected state
   */
  function connectUI() {
    if (elements.connText) elements.connText.textContent = "Conectado";
    updateButtonStates();
    if (elements.loginCard) elements.loginCard.style.display = "none";

    // Start auto-refresh and load history
    HistoryModule.startAutoRefresh();
    const deviceId = window.APP_CONFIG && window.APP_CONFIG.DEVICE_ID
      ? window.APP_CONFIG.DEVICE_ID
      : "esp32-01";
    HistoryModule.load(
      "24h",
      deviceId,
      (msg) => LogModule.append(msg)
    );
  }

  /**
   * Update UI for disconnected state
   */
  function disconnectUI() {
    if (elements.connText) elements.connText.textContent = "Desconectado";
    updateButtonStates();
    if (elements.loginCard) elements.loginCard.style.display = "";

    // Stop auto-refresh
    HistoryModule.stopAutoRefresh();
  }

  /**
   * Load credentials from localStorage
   */
  function loadStoredCredentials() {
    const LS_USER = "mqtt_user";
    const LS_PASS = "mqtt_pass";
    if (elements.userInput) elements.userInput.value = localStorage.getItem(LS_USER) || "";
    if (elements.passInput) elements.passInput.value = localStorage.getItem(LS_PASS) || "";
  }

  /**
   * Save credentials to localStorage
   */
  function saveStoredCredentials(user, pass) {
    const LS_USER = "mqtt_user";
    const LS_PASS = "mqtt_pass";
    localStorage.setItem(LS_USER, user);
    localStorage.setItem(LS_PASS, pass);
  }

  return {
    init,
  };
})();

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  AppModule.init().catch((err) => {
    console.error("App initialization failed:", err);
  });
});
