  /**
   * Scan for available WiFi networks via BLE
   * Triggers scan, waits for scan to complete, and returns network list
   * @param {function} onProgress - Optional callback for scan progress
   * @returns {Promise<Array>} List of networks
   */
  async scanNetworks(onProgress) {
    if (!this.networksCharacteristic || !this.scanStatusCharacteristic) {
      throw new Error('Scan not supported on this device.');
    }

    // Clear previous results (do not persist)
    if (onProgress) onProgress('Clearing previous network list...');
    // Optionally, clear UI here

    // Write to networks characteristic to trigger scan
    if (onProgress) onProgress('Requesting WiFi scan...');
    await this.networksCharacteristic.writeValue(new Uint8Array([0]));

    // Wait for scan status to become 'done'
    let status = '';
    let maxWait = 10000; // 10s timeout
    let start = Date.now();
    while (Date.now() - start < maxWait) {
      const value = await this.scanStatusCharacteristic.readValue();
      status = new TextDecoder().decode(value);
      if (onProgress) onProgress(`Scan status: ${status}`);
      if (status === 'done') break;
      if (status === 'error') throw new Error('WiFi scan failed');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (status !== 'done') throw new Error('WiFi scan timed out');

    // Read network list
    const netValue = await this.networksCharacteristic.readValue();
    const json = new TextDecoder().decode(netValue);
    let networks = [];
    try {
      networks = JSON.parse(json);
    } catch (e) {
      throw new Error('Failed to parse network list');
    }
    if (onProgress) onProgress('Scan complete');
    return networks;
  },
/**
 * ESP32 Pool Controller - BLE Provisioning Module
 * Web Bluetooth API integration for WiFi credential provisioning
 * 
 * Usage:
 * 1. Include this script in your dashboard
 * 2. Call ESP32BLEProvisioning.provision() when user clicks "Add Device"
 * 3. Handle success/error callbacks
 */

const ESP32BLEProvisioning = {
  // BLE Service & Characteristic UUIDs (must match ESP32 firmware)
  SERVICE_UUID: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  SSID_CHAR_UUID: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
  PASSWORD_CHAR_UUID: 'cba1d466-344c-4be3-ab3f-189f80dd7518',
  STATUS_CHAR_UUID: '8d8218b6-97bc-4527-a8db-13094ac06b1d',
  NETWORKS_CHAR_UUID: 'fa87c0d0-afac-11de-8a39-0800200c9a66',
  COMMAND_CHAR_UUID: '8b9d68c4-57b8-4b02-bf19-6fd94b62f709',
  SCAN_STATUS_CHAR_UUID: 'b7e1a1c2-8f8e-4e2a-9b1a-2e3b4c5d6e7f',

  // State
  device: null,
  server: null,
  service: null,
  ssidCharacteristic: null,
  passwordCharacteristic: null,
  statusCharacteristic: null,
  networksCharacteristic: null,
  commandCharacteristic: null,
  scanStatusCharacteristic: null,

  /**
   * Check if Web Bluetooth is supported
   * @returns {boolean} true if supported
   */
  isSupported() {
    if (!navigator.bluetooth) {
      console.error('[BLE] Web Bluetooth API not supported in this browser');
      return false;
    }
    return true;
  },

  /**
   * Scan for ESP32 Pool devices and connect
   * Shows browser's device picker UI
   * @returns {Promise<boolean>} true if connected successfully
   */
  async connect() {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth not supported. Use Chrome, Edge, or Opera.');
    }

    try {
      console.log('[BLE] Scanning for ESP32 Pool devices...');

      // Request device with our service UUID filter
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'ESP32-Pool' },
          { services: [this.SERVICE_UUID] }
        ],
        optionalServices: [this.SERVICE_UUID]
      });

      console.log(`[BLE] Found device: ${this.device.name}`);

      // Connect to GATT server
      console.log('[BLE] Connecting to GATT server...');
      this.server = await this.device.gatt.connect();
      console.log('[BLE] ✓ Connected to GATT server');

      // Get service
      this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
      console.log('[BLE] ✓ Got provisioning service');


      // Get characteristics
      this.ssidCharacteristic = await this.service.getCharacteristic(this.SSID_CHAR_UUID);
      this.passwordCharacteristic = await this.service.getCharacteristic(this.PASSWORD_CHAR_UUID);
      this.statusCharacteristic = await this.service.getCharacteristic(this.STATUS_CHAR_UUID);
      // Optional characteristics used by advanced flows (scan / clear commands)
      try {
        this.networksCharacteristic = await this.service.getCharacteristic(this.NETWORKS_CHAR_UUID);
      } catch (err) {
        console.warn('[BLE] Networks characteristic not found; WiFi scan over BLE will be disabled', err);
      }

      try {
        this.commandCharacteristic = await this.service.getCharacteristic(this.COMMAND_CHAR_UUID);
      } catch (err) {
        console.warn('[BLE] Command characteristic not found; remote commands like clear_wifi will be disabled', err);
      }

      try {
        this.scanStatusCharacteristic = await this.service.getCharacteristic(this.SCAN_STATUS_CHAR_UUID);
        await this.scanStatusCharacteristic.startNotifications();
        this.scanStatusCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
          const value = new TextDecoder().decode(event.target.value);
          console.log(`[BLE] Scan status update: ${value}`);
          // Optionally, update UI here to show scan progress
          if (typeof window !== 'undefined' && window.updateScanStatus) {
            window.updateScanStatus(value);
          }
        });
      } catch (err) {
        console.warn('[BLE] Scan status characteristic not found; scan progress will not be shown', err);
      }

      console.log('[BLE] ✓ Got all characteristics');

      // Subscribe to status notifications
      await this.statusCharacteristic.startNotifications();
      this.statusCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = new TextDecoder().decode(event.target.value);
        console.log(`[BLE] Status update: ${value}`);
      });

      return true;
    } catch (error) {
      console.error('[BLE] Connection error:', error);
      this.cleanup();
      throw error;
    }
  },

  /**
   * Send WiFi credentials to ESP32
   * @param {string} ssid - WiFi network name
   * @param {string} password - WiFi password
   * @returns {Promise<boolean>} true if sent successfully
   */
  async sendCredentials(ssid, password) {
    if (!this.server || !this.server.connected) {
      throw new Error('Not connected to device. Call connect() first.');
    }

    try {
      console.log(`[BLE] Sending SSID: ${ssid}`);
      const ssidEncoder = new TextEncoder();
      await this.ssidCharacteristic.writeValue(ssidEncoder.encode(ssid));
      console.log('[BLE] ✓ SSID sent');

      // Small delay between writes
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('[BLE] Sending password...');
      const passwordEncoder = new TextEncoder();
      await this.passwordCharacteristic.writeValue(passwordEncoder.encode(password));
      console.log('[BLE] ✓ Password sent');

      return true;
    } catch (error) {
      console.error('[BLE] Error sending credentials:', error);
      throw error;
    }
  },

  /**
   * Disconnect from device
   */
  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
      console.log('[BLE] Disconnected');
    }
    this.cleanup();
  },

  /**
   * Clean up state
   */
  cleanup() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.ssidCharacteristic = null;
    this.passwordCharacteristic = null;
    this.statusCharacteristic = null;
    this.networksCharacteristic = null;
    this.commandCharacteristic = null;
  },

  /**
   * Complete provisioning flow (high-level API)
   * @param {string} ssid - WiFi network name
   * @param {string} password - WiFi password
   * @param {Object} callbacks - Optional callbacks { onProgress, onSuccess, onError }
   * @returns {Promise<void>}
   */
  async provision(ssid, password, callbacks = {}) {
    const { onProgress, onSuccess, onError } = callbacks;

    let attempt = 0;
    let delayMs = 500;
    while (attempt < 3) {
      try {
        attempt++;
        // Step 1: Connect to device
        if (onProgress) onProgress(`Scanning for ESP32 devices... (Attempt ${attempt})`);
        await this.connect();

        // Step 2: Send credentials
        if (onProgress) onProgress('Sending WiFi credentials...');
        await this.sendCredentials(ssid, password);

        // Step 3: Wait a moment for ESP32 to process
        if (onProgress) onProgress('ESP32 connecting to WiFi...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 4: Disconnect
        this.disconnect();

        if (onProgress) onProgress('Provisioning complete!');
        if (onSuccess) onSuccess();

        console.log('[BLE] ✓ Provisioning completed successfully');
        return;
      } catch (error) {
        console.error(`[BLE] Provisioning attempt ${attempt} failed:`, error);
        this.disconnect();
        if (attempt >= 3) {
          if (onError) onError(error);
          throw error;
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2;
      }
    }
  },

  /**
   * Request the device to forget its stored WiFi credentials
   * This writes the "clear_wifi" verb to the command characteristic.
   */
  async clearWifiCredentials() {
    if (!this.server || !this.server.connected) {
      throw new Error('Not connected to device. Call connect() first.');
    }

    if (!this.commandCharacteristic) {
      throw new Error(`Command characteristic ${this.COMMAND_CHAR_UUID} not available on this device.`);
    }

    try {
      await this.commandCharacteristic.writeValue(new TextEncoder().encode('clear_wifi'));
      console.log('[BLE] ✓ clear_wifi command sent');
    } catch (error) {
      console.error('[BLE] Failed to send clear_wifi command:', error);
      throw error;
    }
  }
};

// Export for use in modules (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ESP32BLEProvisioning;
}
