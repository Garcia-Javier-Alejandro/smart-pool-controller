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
  COMMAND_CHAR_UUID: '0b9f1e80-0f88-4b68-9a09-9d1d6921d0d8',

  // State
  device: null,
  server: null,
  service: null,
  ssidCharacteristic: null,
  passwordCharacteristic: null,
  statusCharacteristic: null,
  networksCharacteristic: null,
  commandCharacteristic: null,

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

    try {
      // Step 1: Connect to device
      if (onProgress) onProgress('Scanning for ESP32 devices...');
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
    } catch (error) {
      console.error('[BLE] Provisioning failed:', error);
      this.disconnect();
      if (onError) onError(error);
      throw error;
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
