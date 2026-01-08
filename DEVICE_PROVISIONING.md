# Device WiFi Provisioning Guide

This guide covers WiFi provisioning for the ESP32 Pool Controller using two methods:
- **BLE Provisioning** (Android, Windows, macOS)
- **WiFiManager Captive Portal** (iOS, or any device)

## Quick Reference

| Device Type | Method | Browser | Setup Time |
|-------------|--------|---------|-----------|
| **Android Phone** | BLE | Chrome/Edge/Opera | ~2 min |
| **Windows/macOS** | BLE | Chrome/Edge/Opera | ~2 min |
| **iPhone/iPad** | Captive Portal | Safari | ~3-5 min |
| **Device without BLE** | Captive Portal | Any | ~3-5 min |

---

## 🔵 Method 1: BLE Provisioning (Recommended for Android/Windows/macOS)

### How It Works

BLE (Bluetooth Low Energy) allows you to provision WiFi credentials without switching networks or using HTTP. The ESP32 advertises a BLE service that the web dashboard can discover and use to send credentials securely.

### Prerequisites

✅ Chrome, Edge, or Opera browser (Web Bluetooth API support required)
✅ Bluetooth capability on your device
✅ WiFi network and credentials available

### First Time Setup

1. **Power on the ESP32 device**
   - Device will boot and start BLE advertising
   - Check LED indicator (if available)

2. **Open the web dashboard** in your BLE-capable browser
   - Example: `http://192.168.0.x/` (URL from network)
   - Or access the MQTT dashboard if available

3. **Scroll down to "Configurar conexión WiFi"** button
   - Button shows WiFi icon with text
   - Click it to open the provisioning modal

4. **Click "Buscar dispositivo y redes"** button
   - Browser requests permission to access Bluetooth
   - Browser shows device picker dialog
   - Look for `ESP32-Pool-XXXX` (where XXXX = last 4 MAC digits)

5. **Select the ESP32 device**
   - Browser will establish BLE connection
   - Device list will show available networks

6. **Choose your WiFi network** from the scanned list
   - Or enter SSID manually if network not visible
   - Manually entered networks load faster during setup

7. **Enter your WiFi password**
   - Password is case-sensitive
   - Includes special characters if applicable

8. **Click "Conectar"**
   - Dashboard sends credentials securely via BLE
   - ESP32 attempts WiFi connection
   - Success message appears, or error message if credentials incorrect

9. **Device is connected**
   - ESP32 connects to your WiFi network
   - Dashboard can now communicate via WiFi/MQTT
   - BLE automatically disables to save power

### Performance

| Step | Duration |
|------|----------|
| BLE Discovery | 1-2 seconds |
| Network Scan | 2-3 seconds |
| Credential Transmission | 200-300ms |
| WiFi Connection | 5-15 seconds |
| **Total** | **~10-20 seconds** |

### BLE Service Details

**Primary Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b`

| Characteristic | UUID | Direction | Purpose |
|---|---|---|---|
| SSID | `beb5483e-36e1-4688-b7f5-ea07361b26a8` | Write | Send network name |
| Password | `cba1d466-344c-4be3-ab3f-189f80dd7518` | Write | Send network password |
| Networks | `fa87c0d0-afac-11de-8a39-0800200c9a66` | Read | Receive available networks (JSON) |
| Status | `8d8218b6-97bc-4527-a8db-13094ac06b1d` | Read/Notify | Get provisioning status |
| Command | `0b9f1e80-0f88-4b68-9a09-9d1d6921d0d8` | Write | Send special commands |

### BLE Troubleshooting

#### Device doesn't appear in device picker

**Checklist:**
1. ✓ Bluetooth is enabled on your device
2. ✓ Browser is Chrome, Edge, or Opera (Safari/Firefox don't support Web Bluetooth)
3. ✓ ESP32 is powered on
4. ✓ ESP32 has NO saved WiFi credentials (check serial monitor for `[BLE] Advertising`)
5. ✓ You're within Bluetooth range (~10-30 meters / 33-100 feet)

**Solutions:**
- Move closer to the ESP32
- Restart the device (press reset button)
- Check serial monitor for error messages
- Refresh the browser page and try again

#### "GATT Server disconnected" error

**Cause:** Browser cached BLE data from previous connection

**Solution:**
1. Click "Desconectar dispositivos" button
2. Restart ESP32
3. Clear browser cache (Ctrl+Shift+Del → Cookies and cached images)
4. Try again

#### WiFi connection fails after sending credentials

1. **Verify password is correct** (case-sensitive)
2. **Check SSID spelling** (spaces and special characters matter)
3. **Check ESP32 is in range** of the WiFi network
4. **Try entering SSID manually** instead of selecting from list
5. Check serial monitor: `[WiFi] Connection failed: <reason>`

#### BLE connection drops frequently

- Move closer to the ESP32
- Check for Bluetooth interference (other BLE devices, WiFi congestion)
- Reduce distance from router during setup
- Try with a different browser

---

## 🌐 Method 2: WiFiManager Captive Portal (iOS, Any Device)

### How It Works

The ESP32 creates a temporary WiFi hotspot that automatically opens a web portal when you connect. This method works on any device, including iPhones, iPads, and computers without BLE support.

### Prerequisites

✅ Any device with WiFi and a web browser
✅ WiFi credentials available

### First Time Setup

1. **Power on the ESP32 device**
   - Device will boot and create WiFi hotspot

2. **Open WiFi Settings** on your device
   - Look for network named: `ESP32-Pool-Setup`
   - No password required

3. **Connect to the ESP32 hotspot**
   - Select `ESP32-Pool-Setup`
   - Confirm connection

4. **A captive portal should appear automatically**
   - If not, open a web browser and navigate to: `http://192.168.4.1`
   - You may see a page asking you to login (this is the captive portal)

5. **Click on the portal link** if needed
   - This takes you to the WiFi configuration page

6. **Select your WiFi network**
   - From the dropdown list, choose your home/office WiFi
   - Or enter SSID manually

7. **Enter your WiFi password**
   - Password is case-sensitive
   - Includes special characters if applicable

8. **Click "Save"**
   - ESP32 processes your credentials
   - Page shows status updates
   - Device will reboot after saving

9. **Device connects to your WiFi**
   - ESP32 automatically restarts
   - It will no longer be visible as `ESP32-Pool-Setup`
   - Your WiFi network will connect the ESP32
   - Hotspot closes automatically

10. **Connect your device back to your normal WiFi**
    - Your device automatically connects to its regular network
    - Dashboard is now accessible via your home WiFi

### Captive Portal Details

| Item | Value |
|------|-------|
| **Hotspot SSID** | `ESP32-Pool-Setup` |
| **Hotspot Password** | None (open network) |
| **Portal IP Address** | `192.168.4.1` |
| **Hotspot IP Range** | `192.168.4.0/24` |

### Captive Portal Troubleshooting

#### Captive portal doesn't appear automatically

**Solution:**
1. Open a web browser on your connected device
2. Navigate to: `http://192.168.4.1`
3. You should see the WiFi configuration page

#### "No connection available" or "Connected but no internet"

**This is normal!** The hotspot has no internet - this is expected during setup.

**Solution:** Navigate directly to `http://192.168.4.1` in your browser address bar

#### Portal shows "Unable to reach server"

1. Verify you connected to `ESP32-Pool-Setup`
2. Try refreshing the page (F5)
3. Check that the address bar shows `http://192.168.4.1` (not HTTPS)
4. Restart your device and try again

#### ESP32 not creating the hotspot

1. Power cycle the ESP32 (unplug and reconnect)
2. Wait 10 seconds for boot
3. Check that no WiFi credentials are saved
4. Check serial monitor for: `[WiFi] AP Mode` message

#### Connection fails when saving credentials

1. Verify password is correct (case-sensitive)
2. Check SSID spelling (spaces matter)
3. Ensure WiFi network is visible and not hidden
4. Wait 30 seconds and try again (some routers need time)

#### Stuck on "Saving credentials..."

1. Wait 2-3 minutes (device may be rebooting)
2. Refresh the page
3. Try accessing the portal again
4. If stuck, power cycle the ESP32

---

## 🔄 Switching Between Methods

### From BLE to Captive Portal (iOS users)

If you started with BLE on Android and want to re-provision using captive portal:

1. **Disconnect from WiFi:**
   - Click "Desconectar dispositivos" in dashboard
   - Or send MQTT message: `clear` to topic `pool/wifi/clear`
   - ESP32 will restart and create hotspot

2. **Follow Captive Portal Setup** (steps above)

### From Captive Portal to BLE (when available)

If you want to switch back to BLE provisioning:

1. **Clear current WiFi:**
   - While connected, send MQTT: `clear` to `pool/wifi/clear`
   - Or use hardware button if implemented

2. **Follow BLE Setup** (steps above)

---

## 🔐 Security Considerations

### BLE Method

✅ **No Network Switching Required** - Stay on your regular WiFi while provisioning  
✅ **Encrypted Communication** - Web Bluetooth uses TLS encryption  
✅ **Credentials Never Over HTTP** - Sent via encrypted BLE only  
✅ **Auto-Disable After Setup** - BLE stops after WiFi connects, reducing attack surface  
✅ **Proximity-Based** - Only devices within ~30 meters can connect  

⚠️ **No Authentication** - Any nearby device can attempt BLE connection  
⚠️ **Visual Access** - Attacker could see SSID/password if watching you  

### Captive Portal Method

✅ **Works on Any Device** - No special browser required  
✅ **Quick Setup** - No scanning or app installation needed  

⚠️ **Open Network** - `ESP32-Pool-Setup` has no password  
⚠️ **Plain HTTP** - Credentials sent unencrypted (but only on isolated hotspot)  
⚠️ **Temporary** - Portal closes after WiFi connection, so time-window is limited  

### Best Practices for Both Methods

1. **Use Strong WiFi Passwords** (8+ characters, mix of upper/lower/numbers)
2. **Keep BLE Updated** - Use latest browser version
3. **Setup in Private Location** - Avoid public WiFi areas during provisioning
4. **Verify ESP32 Identity** - Device name `ESP32-Pool-XXXX` matches your device
5. **Check Passwords Carefully** - No auto-correct for passwords

---

## 📱 Browser Compatibility

### BLE Provisioning Compatibility

| Browser | Desktop | Android | iOS |
|---------|---------|---------|-----|
| **Chrome** | ✅ Working | ✅ Working | ❌ Not Supported |
| **Edge** | ✅ Working | ✅ Working | ❌ Not Supported |
| **Opera** | ✅ Working | ✅ Working | ❌ Not Supported |
| **Safari** | ❌ No Web Bluetooth | ❌ No Web Bluetooth | ❌ No Web Bluetooth |
| **Firefox** | ❌ Disabled | ❌ Disabled | ❌ Not Supported |

**Recommendation:** Use Chrome for best compatibility across all platforms

### Captive Portal Compatibility

| Browser | Works? | Notes |
|---------|--------|-------|
| **Any HTTP-capable browser** | ✅ Yes | Chrome, Safari, Firefox, Edge, all work |
| **Mobile browsers** | ✅ Yes | Automatic portal detection on most devices |
| **HTTPS-enforcing browsers** | ⚠️ Mostly | May require manual navigation to `http://192.168.4.1` |

**Recommendation:** Captive portal is most universal for mobile devices

---

## � Power Failure Recovery

The ESP32 is designed to automatically recover from power failures without needing re-provisioning:

### Automatic Reconnection After Power Failure

**What happens:**
1. **ESP32 boots** and loads saved WiFi credentials from non-volatile storage (NVS)
2. **Attempts connection** with **5 retry attempts** (15 seconds timeout each)
3. **Waits 5 seconds** between retry attempts
4. **Keeps credentials** even if connection fails (router may still be booting)
5. **Continues retrying** every 10 seconds in the background

**Key Features:**
- ✅ **Credentials preserved** - Never automatically deleted
- ✅ **Multiple retries** - Up to 5 attempts on boot
- ✅ **Background reconnection** - Continues trying every 10 seconds
- ✅ **MQTT auto-recovery** - Reconnects to broker after WiFi recovery
- ✅ **No user intervention** - Fully automatic recovery

**Typical Power Failure Scenario:**
```
Power restored → Router boots (30-60s) → ESP32 retrying → Connection established
Total recovery time: 1-2 minutes (automatic)
```

### Manual Credential Management

**To update WiFi credentials:**
- Use BLE provisioning from dashboard (overwrites saved credentials)
- Send MQTT command: `clear` to topic `pool/wifi/clear` (erases and restarts)

**To force re-provisioning:**
- Send MQTT command to clear WiFi (see below)
- Or flash new firmware (erases all settings)

---

## �🚀 Which Method Should I Use?

### Choose **BLE Provisioning** if:
- ✅ You have an Android phone or Windows/macOS device
- ✅ You want faster setup (~10-20 seconds total)
- ✅ You're in a secure environment
- ✅ You want to avoid switching WiFi networks

### Choose **Captive Portal** if:
- ✅ You have an iPhone or iPad
- ✅ You don't have Web Bluetooth support
- ✅ You prefer a simpler, no-pairing process
- ✅ You're already familiar with WiFi hotspot setup

### Use **Both Methods** if:
- ✅ You have multiple devices (Android + iPhone)
- ✅ You want flexibility for different users
- ✅ You need a backup if BLE fails

---

## 📊 Comparison Table

| Feature | BLE | Captive Portal |
|---------|-----|---|
| **Setup Speed** | ~10-20 sec | ~30-60 sec |
| **Network Switching Required** | ❌ No | ✅ Yes (temporarily) |
| **Browser Support** | 3 browsers | Any browser |
| **iOS Support** | ❌ No | ✅ Yes |
| **Encryption** | ✅ TLS | ⚠️ Isolated network |
| **Requires Pairing** | ❌ No | ❌ No |
| **Works Offline** | ✅ Yes | ✅ Yes |
| **Automatic Portal** | N/A | ✅ Usually |
| **Multi-device Provisioning** | ✅ Easy | ✅ Easy |

---

## 🔧 Advanced Options

### Remote WiFi Clearing (MQTT)

If device is already connected to WiFi and MQTT broker:

**Send MQTT Message:**
- **Broker:** Your MQTT broker (HiveMQ, Mosquitto, etc.)
- **Topic:** `pool/wifi/clear`
- **Payload:** `clear`

**Result:**
1. ESP32 publishes `disconnected` status
2. Erases WiFi credentials from NVS
3. Automatically restarts
4. Returns to provisioning mode (BLE or captive portal)

**Tool to send message:**
```bash
mosquitto_pub -h your-broker -u your-user -P your-pass -t "pool/wifi/clear" -m "clear"
```

### Full Flash Erase (Development Only)

For development or complete reset:

```bash
esptool.py -p COM3 erase_flash
platformio run -t upload
```

This erases **all** ESP32 memory including WiFi and MQTT credentials.

---

## 🆘 Support & Troubleshooting

### General Checklist

- [ ] ESP32 is powered on (check LED)
- [ ] You have WiFi network name and password
- [ ] Device is within Bluetooth range (BLE) or WiFi range (portal)
- [ ] Using compatible browser (Chrome for BLE, any for portal)
- [ ] No other devices provisioning simultaneously

### Still Having Issues?

1. **Check serial monitor** output for error messages
2. **Review log file** on dashboard
3. **Restart ESP32** (power cycle)
4. **Clear browser cache** (Ctrl+Shift+Del)
5. **Try the alternative method** (BLE ↔ Captive Portal)

---

## 📚 References

- [Web Bluetooth API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [ESP32 BLE API](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/bluetooth/index.html)
- [WiFiManager Library](https://github.com/tzapu/WiFiManager)
- [ESP32 NVS Storage](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/storage/nvs_flash.html)
