/**
 * History Module
 * Manages fetching history from the API and rendering with uPlot.
 * Requires uPlot library (global uPlot object)
 */

const HistoryModule = (() => {
  let historyEvents = []; // Array of { ts: ms, state: "ON"|"OFF" }
  let historyPlot = null;
  let historyChart = null;
  let hintEl = null;
  let lastUpdateEl = null;
  let lastRange = "24h";
  let historyTimer = null;
  let historyDebounceTimer = null;
  let historyInFlight = false;

  /**
   * Initialize history module with DOM elements
   * @param {HTMLElement} chartEl - Container for the uPlot chart
   * @param {HTMLElement} hintElem - Element for status messages
   * @param {HTMLElement} refreshBtn - Button to refresh history
   * @param {HTMLElement} lastUpdateEl - Element to show last update time
   */
  function init(chartEl, hintElem, refreshBtn, lastUpdate) {
    historyChart = chartEl;
    hintEl = hintElem;
    lastUpdateEl = lastUpdate;

    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        // Refresh using the current selected range
        load(lastRange, window.APP_CONFIG?.DEVICE_ID || "esp32-01", () => {});
      });
    }

    // Auto-resize on window resize
    window.addEventListener("resize", () => {
      if (historyPlot) {
        const w = historyChart.clientWidth || 600;
        historyPlot.setSize({ width: w, height: 160 });
      }
    });
  }

  /**
   * Start auto-refresh timer (called on MQTT connect)
   * Auto-refreshes every 300 seconds (5 minutes)
   */
  function startAutoRefresh() {
    if (historyTimer) clearInterval(historyTimer);
    historyTimer = setInterval(() => load("24h"), 300000);
  }

  /**
   * Stop auto-refresh timer (called on MQTT disconnect)
   */
  function stopAutoRefresh() {
    if (historyTimer) {
      clearInterval(historyTimer);
      historyTimer = null;
    }
  }

  /**
   * Schedule a debounced history refresh
   * Used to avoid hammering the API on rapid state changes
   * @param {number} delay - Delay in ms (default 800)
   */
  function scheduleRefresh(delay = 800) {
    if (historyDebounceTimer) clearTimeout(historyDebounceTimer);

    historyDebounceTimer = setTimeout(async () => {
      historyDebounceTimer = null;
      if (!historyChart) return;
      if (historyInFlight) return;

      historyInFlight = true;
      try {
        await load(lastRange);
      } finally {
        historyInFlight = false;
      }
    }, delay);
  }

  /**
   * Convert ms timestamps to seconds for uPlot, separating by valve
   * @param {Array} eventsMs - Array of { ts: ms, state: string, valveId: number }
   * @returns {Array} [xArray, y1Array, y2Array] for uPlot
   */
  function buildAlignedData(eventsMs) {
    // Build separate arrays for valve1 and valve2, sorted by timestamp
    const valve1Events = eventsMs
      .filter(e => e.valveId === 1)
      .map(e => ({ tSec: Math.floor(Number(e.ts) / 1000), state: e.state }))
      .sort((a, b) => a.tSec - b.tSec);
    
    const valve2Events = eventsMs
      .filter(e => e.valveId === 2)
      .map(e => ({ tSec: Math.floor(Number(e.ts) / 1000), state: e.state }))
      .sort((a, b) => a.tSec - b.tSec);
    
    // Get all unique timestamps
    const allTimestamps = new Set();
    eventsMs.forEach(e => {
      const tSec = Math.floor(Number(e.ts) / 1000);
      if (Number.isFinite(tSec)) {
        allTimestamps.add(tSec);
      }
    });
    
    const x = Array.from(allTimestamps).sort((a, b) => a - b);
    
    // Build y arrays, carrying forward last known state for stepped chart
    const y1 = new Array(x.length);
    const y2 = new Array(x.length);
    
    let lastValve1State = null;
    let valve1Idx = 0;
    
    let lastValve2State = null;
    let valve2Idx = 0;
    
    for (let i = 0; i < x.length; i++) {
      const timestamp = x[i];
      
      // Update valve1 state if there's an event at this timestamp
      while (valve1Idx < valve1Events.length && valve1Events[valve1Idx].tSec <= timestamp) {
        lastValve1State = valve1Events[valve1Idx].state === "ON" ? 1 : 0;
        valve1Idx++;
      }
      y1[i] = lastValve1State;
      
      // Update valve2 state if there's an event at this timestamp
      while (valve2Idx < valve2Events.length && valve2Events[valve2Idx].tSec <= timestamp) {
        lastValve2State = valve2Events[valve2Idx].state === "ON" ? 1 : 0;
        valve2Idx++;
      }
      y2[i] = lastValve2State;
    }
    
    return [x, y1, y2];
  }

  /**
   * Render the uPlot chart
   * @param {string} range - Time range ("1h", "24h", "all")
   */
  function renderPlot(range = "24h") {
    lastRange = range;

    if (!historyChart) {
      return;
    }

    const data = buildAlignedData(historyEvents);

    // Update hint text with time range
    if (hintEl) {
      const rangeText = {
        "1h": "en la última hora",
        "24h": "en las últimas 24 horas",
        "all": "desde el inicio"
      }[range] || "en el rango";
      
      hintEl.textContent = historyEvents.length
        ? `${historyEvents.length} evento(s) ${rangeText}`
        : "(sin eventos en el rango)";
    }

    // No data: destroy chart and show empty state
    if (!data[0].length) {
      if (historyPlot) {
        historyPlot.destroy();
        historyPlot = null;
      }
      historyChart.innerHTML = "";
      return;
    }

    // Calculate time range in seconds for uPlot
    const nowSec = Math.floor(Date.now() / 1000);
    const rangeMap = {
      "1h": 60 * 60,
      "24h": 24 * 60 * 60,
      "all": null
    };
    const rangeSec = rangeMap[range];
    
    let minTime, maxTime;
    if (range === "all") {
      // For "all", use actual data range with padding
      if (data[0].length > 0) {
        const firstTs = data[0][0];
        const lastTs = data[0][data[0].length - 1];
        const padding = Math.max((lastTs - firstTs) * 0.05, 3600); // 5% padding or 1 hour min
        minTime = Math.floor(firstTs - padding);
        maxTime = Math.ceil(Math.max(lastTs + padding, nowSec));
      } else {
        // Fallback for "all" with no data - show last 30 days
        minTime = nowSec - 30 * 24 * 60 * 60;
        maxTime = nowSec;
      }
    } else {
      // For fixed ranges (1h, 24h), use exact time windows
      minTime = nowSec - rangeSec;
      maxTime = nowSec;
    }

    // Date formatter for dd/mm or dd/mm/yyyy
    function fmtDate(ts) {
      const d = new Date(ts * 1000);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      
      // Show year if not current year
      const currentYear = new Date().getFullYear();
      return year !== currentYear ? `${day}/${month}/${year}` : `${day}/${month}`;
    }

    // Configure uPlot options
    const stepped = uPlot.paths && uPlot.paths.stepped
      ? uPlot.paths.stepped({ align: 1 })
      : null;

    const opts = {
      width: historyChart.clientWidth || 600,
      height: 160,
      legend: {
        show: false, // Hide legend to avoid overlap with range buttons
      },
      scales: {
        x: { 
          time: true,
          range: [minTime, maxTime],
        },
        y: {
          auto: false,
          range: (u, min, max) => [-0.2, 1.2],
        },
      },
      axes: [
        {
          space: 50,
          values: (u, vals, space) => vals.map(v => {
            const d = new Date(v * 1000);
            
            // For short ranges (1h), show time
            if (range === "1h") {
              return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            }
            // For longer ranges (24h, all), show date
            return fmtDate(v);
          }),
        },
        {
          splits: (u) => [0, 1],
          values: (u, splits) => splits.map((v) => (v === 1 ? "ON" : "OFF")),
        },
      ],
      series: [
        {}, // x series
        {
          label: "Válvula 1",
          width: 3,
          stroke: "#3b82f6", // Blue color
          fill: "rgba(59, 130, 246, 0.1)", // Light blue fill
          paths: stepped || undefined,
          value: (u, v) => (v === 1 ? "ON" : v === 0 ? "OFF" : "-"),
          points: {
            show: true,
            size: 5,
            width: 2,
            stroke: "#3b82f6",
            fill: "#ffffff",
          },
        },
        {
          label: "Válvula 2",
          width: 3,
          stroke: "#10b981", // Green color
          fill: "rgba(16, 185, 129, 0.1)", // Light green fill
          paths: stepped || undefined,
          value: (u, v) => (v === 1 ? "ON" : v === 0 ? "OFF" : "-"),
          points: {
            show: true,
            size: 5,
            width: 2,
            stroke: "#10b981",
            fill: "#ffffff",
          },
        },
      ],
    };

    // Destroy and recreate chart to ensure proper scale rendering
    if (historyPlot) {
      historyPlot.destroy();
      historyPlot = null;
    }
    historyChart.innerHTML = "";
    historyPlot = new uPlot(opts, data, historyChart);
  }

  /**
   * Fetch history from API and render chart
   * @param {string} range - Time range ("1h", "24h", "all")
   * @param {string} deviceId - Device ID
   * @param {Function} logFn - Function to call for logging
   */
  async function load(range = "24h", deviceId = "esp32-01", logFn = () => {}) {
    try {
      // Update lastRange immediately to prevent cache issues
      lastRange = range;
      
      if (hintEl) hintEl.textContent = "Cargando histórico...";

      const url = `/api/history?deviceId=${encodeURIComponent(
        deviceId
      )}&range=${encodeURIComponent(range)}&limit=200&_=${Date.now()}`;

      const historyRes = await fetch(url, { cache: "no-store" });
      const data = await historyRes.json();

      if (!data.ok) {
        if (hintEl) hintEl.textContent = "Error cargando histórico";
        logFn("Error cargando histórico del API");
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      historyEvents = items
        .map((ev) => ({ 
          ts: Number(ev.ts), 
          state: ev.state,
          valveId: Number(ev.valve_id) || 1 // Default to valve 1 for old events
        }))
        .filter(
          (e) =>
            Number.isFinite(e.ts) && 
            (e.state === "ON" || e.state === "OFF") &&
            (e.valveId === 1 || e.valveId === 2)
        )
        .sort((a, b) => a.ts - b.ts);
      
      logFn(`Histórico cargado: ${historyEvents.length} eventos`);

      // Update last update timestamp
      if (lastUpdateEl) {
        const timestamp = new Date().toLocaleTimeString();
        lastUpdateEl.textContent = "Última actualización: " + timestamp;
      }

      // Render chart directly (not in next frame to avoid timing issues)
      renderPlot(range);
    } catch (e) {
      if (hintEl) hintEl.textContent = "Error cargando histórico";
      logFn("Error: " + e.message);
    }
  }

  /**
   * Get current history events
   * @returns {Array}
   */
  function getEvents() {
    return [...historyEvents];
  }

  /**
   * Cleanup before page unload
   */
  function cleanup() {
    stopAutoRefresh();
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = null;
    }
    if (historyPlot) {
      historyPlot.destroy();
      historyPlot = null;
    }
  }

  return {
    init,
    load,
    renderPlot,
    scheduleRefresh,
    startAutoRefresh,
    stopAutoRefresh,
    getEvents,
    cleanup,
  };
})();
