# ESP32 Pool Control System v3.1

IoT-based swimming pool control system using ESP32, MQTT, and DS18B20 temperature sensor. Controls a 220V pump and 24V electrovalves with manual override capability and automated scheduling.

**Status**: ✅ Fully functional and deployed to production  
**Last Updated**: January 2, 2026

## 🏊 Project Overview

This system allows remote control of:
- **1× Swimming pool pump** (220V AC) via standard SONGLE relay
- **2× Electrovalves** (24V) wired in parallel (NC + NO) - controlled by single relay
  - Relay LOW = Mode 1 (Cascada) - NC valve open, NO valve closed
  - Relay HIGH = Mode 2 (Eyectores) - NC valve closed, NO valve open
- **1× DS18B20 temperature sensor** - Pool water temperature monitoring

### Key Features

- ✅ **Standard relay control** - Continuous HIGH/LOW for SONGLE SRD-5VDC-SL-C relays
- ✅ **Temperature monitoring** - DS18B20 OneWire sensor with 1-minute update intervals
- ✅ **Manual override compatibility** - SPDT switches wired in parallel with ESP32 relays
- ✅ **Blind control** - No feedback sensors, simple command-based operation
- ✅ **MQTT over TLS** - Secure communication via HiveMQ Cloud
- ✅ **Modern responsive dashboard** - Mobile-first design with Quicksand font and animated effects
- ✅ **Countdown timer** - Set duration and mode for automatic pump shutoff
- ✅ **Program scheduling** - Up to 3 weekly schedules with automatic execution
- ✅ **Conflict detection** - Automatic handling of timer/program/manual conflicts
- ✅ **WiFi status monitoring** - Real-time signal strength with color-coded indicators
- ✅ **Event logging** - Collapsible log panel with timestamps
- ✅ **WiFi provisioning** - Captive portal for easy setup (feature/wifi-provisioning branch)

---

## 🏗️ System Architecture

### Current Design (Single-Tenant)

```
┌──────────────────────────────────────────────────────┐
│                   Internet/WiFi                      │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │   HiveMQ Cloud MQTT    │
            │      Broker (TLS)      │
            │   8883 (MQTT) / 8884   │
            │  (WebSocket Secure)    │
            └────────────┬───────────┘
                    ┌────┴─────────┐
                    │              │
                    ▼              ▼
        ┌──────────────────┐  ┌──────────────┐
        │  Web Dashboard   │  │  ESP32       │
        │  (Browser/HTTPS) │  │  (WiFi)      │
        │  Pub: pump/set   │  │  Sub: */set  │
        │  Sub: */state    │  │  Pub: */state│
        └──────────────────┘  └──────────────┘
                    ▲              │
                    │              ▼
                    │      ┌──────────────┐
                    └─────→│   Pool HW    │
                           │ (Pump+Valves)│
                           └──────────────┘
```

### Key Characteristics

| Aspect | Details |
|--------|---------|
| **Broker** | HiveMQ Cloud (external, managed) |
| **Communication** | MQTT over TLS (port 8883) + WebSocket Secure (port 8884) |
| **Dashboard** | Runs in browser, connects directly to MQTT |
| **Credentials** | Hardcoded in `config.js` (dashboard) and `secrets.h` (firmware) |
| **Scope** | Single pool, single device, single user |
| **Deployment** | Cloudflare Pages (dashboard), ESP32 (firmware) |

### Data Flow Example

**User clicks pump ON:**

1. **Dashboard** → `publish("devices/esp32-pool-01/pump/set", "ON")`
2. **MQTT Broker** → Stores in topic
3. **ESP32** ← `subscribe("devices/esp32-pool-01/pump/set")`
4. **ESP32** → Receives "ON", activates relay GPIO 19
5. **ESP32** → `publish("devices/esp32-pool-01/pump/state", "ON", retain=true)`
6. **Dashboard** ← `subscribe("devices/esp32-pool-01/pump/state")`
7. **Dashboard** → Updates UI to show pump ON

**Real-time latency: ~100-500ms** (depending on WiFi)

### Security Model

✅ **TLS Encryption** - All MQTT traffic encrypted
✅ **MQTT Username/Password** - Authentication with broker
✅ **Device Isolation** - Topics scoped to `esp32-pool-01`

⚠️ **Limitations** - Current single-tenant design:
- Credentials visible in browser source code
- No multi-device support
- No user access control
- Not suitable for commercial/multi-customer deployment

---

## 🚀 Scalability: Current vs. Future

### Single-Tenant (Current ✅)
- **Setup**: One MQTT broker + one dashboard = one pool
- **For**: Personal use, single installation
- **Cost**: ~$10-15/month (HiveMQ hobby tier)
- **Complexity**: Low

### Multi-Tenant (Future 🔄)
- **Would need**: Backend proxy, credential storage, user management
- **For**: Multiple customers, multiple pools per customer
- **Cost**: Higher (backend server + scaling)
- **Benefits**: 
  - Secure credential storage
  - User access control
  - Usage tracking/billing
  - Shared dashboard codebase

**See [ARCHITECTURE_NOTES.md](ARCHITECTURE_NOTES.md) for detailed multi-tenant design proposal**

---

```
IoT/
├── firmware/                    # ESP32 firmware (PlatformIO)
│   ├── src/main.cpp            # Main control logic
│   ├── include/
│   │   ├── config.h            # GPIO pins, MQTT topics, thresholds
│   │   ├── secrets.h           # WiFi/MQTT credentials (not committed)
│   │   └── ca_cert.h           # TLS certificate
│   └── platformio.ini          # PlatformIO configuration
│
├── docs/                        # Web dashboard (PWA-ready)
│   ├── index.html              # Main dashboard (NEW unified design!)
│   ├── config.js               # MQTT topics and device ID
│   ├── js/
│   │   ├── app.js              # Main application controller
│   │   ├── mqtt.js             # MQTT client wrapper
│   │   ├── programas.js        # Schedule management module
│   │   ├── log.js              # Event logging module
│   │   └── history.js          # Historical data (optional)
│   ├── logo.png                # Application logo
│   └── _routes.json            # Deployment routes config
│
├── WIRING_DIAGRAM.md           # Complete hardware wiring guide
└── README_POOL.md              # This file
```


---

## ⚡ GPIO Pin Assignment
## 🧪 Testing & Development

### Using the Simulator

The `test_simulator.py` script simulates an ESP32 for testing the dashboard without hardware:

#### Setup
```bash
pip install paho-mqtt
python test_simulator.py
```

#### Features
- **Publishes simulated states**: Pump state, valve mode, temperature, WiFi status, timer state
- **Responds to dashboard commands**: Accepts pump ON/OFF, valve mode changes, timer start/stop
- **Temperature simulation**: Random 20-28°C readings every 60 seconds
- **WiFi simulation**: Varying signal strength (-45 to -75 dBm) every 30 seconds
- **Timer countdown**: Full timer simulation with auto-stop after duration expires
- **Real-time console**: Color-coded output showing all MQTT messages

#### Usage
1. Configure your MQTT broker URL and credentials in the script
2. Run the simulator: `python test_simulator.py`
3. Open dashboard and connect to same MQTT broker
4. Dashboard should show simulated pump, valve, temperature, and WiFi status
5. Toggle pump/valve in dashboard → simulator responds with state changes
6. Start a timer → simulator counts down and auto-stops

#### MQTT Topics Simulated
- `devices/esp32-pool-01/pump/state` - Pump ON/OFF state
- `devices/esp32-pool-01/valve/state` - Valve mode 1/2
- `devices/esp32-pool-01/temperature/state` - Current water temperature
- `devices/esp32-pool-01/wifi/state` - WiFi connection details
- `devices/esp32-pool-01/timer/state` - Timer countdown and status
- Plus command topics: `.../pump/set`, `.../valve/set`, `.../timer/set`

#### Output Example
```
==================================================
ESP32 Pool Control Simulator
==================================================
Broker: 1f1fff2e23204fa08aef0663add440bc.s1.eu.hivemq.cloud:8883
Device: esp32-pool-01
==================================================

Connecting to broker...
✓ Connected to MQTT broker
✓ Subscribed to devices/esp32-pool-01/pump/set
✓ Subscribed to devices/esp32-pool-01/valve/set
✓ Subscribed to devices/esp32-pool-01/timer/set
[TX] devices/esp32-pool-01/pump/state: OFF
[TX] devices/esp32-pool-01/valve/state: 1
[TX] devices/esp32-pool-01/temperature/state: 24.3°C
[TX] devices/esp32-pool-01/wifi/state: {"status": "connected", ...}

✓ Simulator running. Press Ctrl+C to stop.

Commands from dashboard will be processed automatically.
Publishing WiFi status every 30 seconds...
Publishing temperature every 60 seconds...
```

---

## 🏗️ System Architecture

### Current Design (Single-Tenant)

```
┌──────────────────────────────────────────────────────┐
│                   Internet/WiFi                      │
└────────────────────────┬─────────────────────────────┘
          │
          ▼
       ┌────────────────────────┐
       │   HiveMQ Cloud MQTT    │
       │      Broker (TLS)      │
       │   8883 (MQTT) / 8884   │
       │  (WebSocket Secure)    │
       └────────────┬───────────┘
          ┌────┴─────────┐
          │              │
          ▼              ▼
   ┌──────────────────┐  ┌──────────────┐
   │  Web Dashboard   │  │  ESP32       │
   │  (Browser/HTTPS) │  │  (WiFi)      │
   │  Pub: pump/set   │  │  Sub: */set  │
   │  Sub: */state    │  │  Pub: */state│
   └──────────────────┘  └──────────────┘
          ▲              │
          │              ▼
          │      ┌──────────────┐
          └─────→│   Pool HW    │
            │ (Pump+Valves)│
            └──────────────┘
```

### Key Characteristics

| Aspect | Details |
|--------|---------|
| **Broker** | HiveMQ Cloud (external, managed) |
| **Communication** | MQTT over TLS (port 8883) + WebSocket Secure (port 8884) |
| **Dashboard** | Runs in browser, connects directly to MQTT |
| **Credentials** | In `secrets.h` (firmware) and `config.js` (dashboard) |
| **Scope** | Single pool, single device, single user |
| **Deployment** | Cloudflare Pages (dashboard), ESP32 via USB (firmware) |

### Data Flow Example

**User clicks pump ON:**

1. **Dashboard** → `publish("devices/esp32-pool-01/pump/set", "ON")`
2. **MQTT Broker** → Stores in topic
3. **ESP32** ← `subscribe("devices/esp32-pool-01/pump/set")`
4. **ESP32** → Receives "ON", activates relay GPIO 19
5. **ESP32** → `publish("devices/esp32-pool-01/pump/state", "ON", retain=true)`
6. **Dashboard** ← `subscribe("devices/esp32-pool-01/pump/state")`
7. **Dashboard** → Updates UI to show pump ON

**Real-time latency: ~100-500ms** (depending on WiFi)

### Security Model

✅ **TLS Encryption** - All MQTT traffic encrypted
✅ **MQTT Username/Password** - Authentication with broker
✅ **Device Isolation** - Topics scoped to `esp32-pool-01`

⚠️ **Limitations** - Current single-tenant design:
- Credentials visible in browser source code
- No multi-device support
- No user access control
- Not suitable for commercial/multi-customer deployment

### Why Direct Dashboard → MQTT Connection?

**Advantages:**
1. ✅ **Simple** - No backend required, runs entirely at the edge
2. ✅ **Real-time** - WebSocket connection = instant updates (100-500ms latency)
3. ✅ **Cost-effective** - Serverless design, minimal infrastructure
4. ✅ **Offline-capable** - Dashboard can work without backend services
5. ✅ **Responsive** - Direct connection vs. backend hop = lower latency

**Disadvantages:**
1. ❌ **Credentials in code** - MQTT broker password visible in browser
2. ❌ **No multi-tenancy** - One broker per deployment
3. ❌ **Scaling issues** - Can't easily add multiple devices/pools
4. ❌ **No user management** - No access control or permissions
5. ❌ **Security risk** - Credentials could be compromised if code is leaked

---

## 🚀 Future Enhancements & Scalability

### Planned Features (Not Yet Built)

- [ ] **WiFi Provisioning** - Captive portal for first-time setup without hardcoded credentials
- [ ] Temperature alert thresholds (low/high water temp)
- [ ] OTA (Over-The-Air) firmware updates
- [ ] Historical data visualization and analytics
- [ ] Email/SMS notifications for critical events
- [ ] Integration with Home Assistant / Google Home
- [ ] Multiple device support (control multiple pools)
- [ ] Relay health monitoring (click count tracking)
- [ ] Reset WiFi feature - Allow re-provisioning without reflashing firmware
- [ ] QR code provisioning for faster setup
- [ ] WPA3 network support

### Scalability Roadmap

#### Phase 1: Current (Today ✅)
- Single pool, hardcoded MQTT
- Dashboard in browser
- Credentials in code
- Personal use only

#### Phase 2: Credential Provisioning (Planned)
- Keep single-tenant for now
- Add WiFiManager for ESP32 WiFi setup via captive portal
- MQTT credentials still hardcoded (future phase)

#### Phase 3: Multi-Device Support (Future)
- Support multiple ESP32s on same MQTT broker
- Device selector in dashboard UI
- Multiple topic prefixes

#### Phase 4: Multi-Tenant Backend (If Needed)
- Build backend gateway
- Implement user authentication
- Support multiple MQTT brokers
- Add billing/analytics
- Commercial deployment ready

### Future: Multi-Tenant Backend Proxy

**If supporting multiple customers**, the architecture would look like:

```
User A ┐
User B ├─→ Browser/Dashboard ─→ Backend Gateway ─→ MQTT Broker A ─→ ESP32-A
User C ┘     (single codebase)   (credential      MQTT Broker B ─→ ESP32-B
              manager)         MQTT Broker C ─→ ESP32-C
                     ...
```

**Backend Gateway Responsibilities:**
1. **Authentication** - User login, JWT tokens, session management
2. **Credential Management** - Secure storage, encryption, dynamic injection
3. **Proxying** - WebSocket relay to correct MQTT broker per user
4. **Features** - User/device management, usage tracking, audit logging

**Technology Options for Backend:**
- Node.js + Express (~$20-50/month)
- Cloudflare Workers (~$5-20/month)
- AWS Lambda (~$10-100/month)
- Python aiohttp (~$20-50/month)

### Decision Matrix

| Need | Current | Phase 3 | Phase 4 |
|------|---------|---------|---------|
| Single pool | ✅ Perfect | ✅ Overkill | ❌ Overkill |
| Multiple pools (same user) | ⚠️ Hacky | ✅ Good | ✅ Perfect |
| Multiple users | ❌ Impossible | ❌ Impossible | ✅ Perfect |
| Commercial SaaS | ❌ Impossible | ❌ Impossible | ✅ Perfect |
| Time to implement | ✅ Done | 📅 1-2 weeks | 📅 4-8 weeks |
| Monthly cost | 💰 ~$10 | 💰 ~$20 | 💰 ~$50-200 |
| Complexity | 💡 Very Low | 📊 Medium | 🔧 High |

---

## 🔒 Security Best Practices

### Current (Single-Tenant)
- ✅ Always use TLS (never unencrypted MQTT)
- ✅ Strong MQTT password (20+ chars)
- ✅ Keep `secrets.h` in `.gitignore`
- ✅ Use retained messages carefully
- ✅ Validate all MQTT payloads
- ⚠️ Credentials visible in browser (acceptable for personal use only)

### Security Threats & Mitigations

| Threat | Impact | Current | Future |
|--------|--------|---------|--------|
| Credentials in code | HIGH | TLS only | Backend vault |
| MQTT hijacking | CRITICAL | TLS + password | Broker replication |
| Man-in-the-middle | MEDIUM | TLS encryption | mTLS certificates |
| Unauthorized access | HIGH | Device isolation | RBAC + JWT |
| DDoS | MEDIUM | Not applicable | Rate limiting |

### Future Security Enhancements
- 🔒 OAuth2 / JWT authentication
- 🔒 Hardware security modules (HSM)
- 🔒 Credential rotation
- 🔒 Audit logging
- 🔒 Rate limiting
- 🔒 DDoS protection (Cloudflare)
- 🔒 Regular security audits

---

## 📁 Project Structure

```
IoT/
├── firmware/                    # ESP32 firmware (PlatformIO)
│   ├── src/main.cpp            # Main control logic
│   ├── include/
│   │   ├── config.h            # GPIO pins, MQTT topics, thresholds
│   │   ├── secrets.h           # WiFi/MQTT credentials (not committed)
│   │   └── ca_cert.h           # TLS certificate
│   └── platformio.ini          # PlatformIO configuration
│
├── docs/                        # Web dashboard (PWA-ready)
│   ├── index.html              # Main dashboard (Quicksand font, animated)
│   ├── config.js               # MQTT topics and device ID
│   ├── js/
│   │   ├── app.js              # Main application controller
│   │   ├── mqtt.js             # MQTT client wrapper
│   │   ├── programas.js        # Schedule management module
│   │   ├── log.js              # Event logging module
│   │   └── history.js          # Historical data (optional)
│   ├── css/
│   │   └── styles.css          # Dashboard styles
│   ├── logo.png                # Application logo
│   └── _routes.json            # Cloudflare Pages config
│
├── test_simulator.py           # MQTT simulator for testing (no hardware)
├── WIRING_DIAGRAM.md           # Complete hardware wiring guide
├── DATABASE_MIGRATION.md       # Historical database migration notes
├── WIFI_PROVISIONING.md        # WiFiManager documentation (feature branch)
├── README.md                   # This file
└── README_POOL.md              # Detailed pool-specific documentation
```

---

## 🛠️ Installation & Setup

### Hardware Requirements

| Item | Qty | Approx. Cost |
|------|-----|--------------|
| ESP32 NodeMCU-32S | 1 | $8 |
| Songle SRD-05VDC-SL-C relay | 2 | $4 |
| DS18B20 temperature sensor | 1 | $3 |
| LM2596S buck converter | 1 | $5 |
| 220VAC power supply | 1 | $6 |
| IP65 enclosure | 1 | $10 |
| Misc. resistors, wire, connectors | - | $5-10 |
| **Total** | - | **~$40-50** |

### 1. Hardware Assembly

1. Connect ESP32 → SONGLE relay modules
2. GPIO 25 → Relay IN1 (Valve control) + 10kΩ pull-down
3. GPIO 26 → Relay IN2 (Pump control) + 10kΩ pull-down
4. GPIO 21 → DS18B20 data line + 4.7kΩ pull-up
5. Wire relays in parallel with manual SPDT switches (optional)

### 2. Firmware Setup

```bash
# Copy secrets template
cp firmware/include/"secrets (example).h" firmware/include/secrets.h

# Edit secrets.h with your WiFi and MQTT credentials
# Then flash
cd firmware
pio run --target upload
```

### 3. Dashboard Deployment

Dashboard automatically deploys to Cloudflare Pages on push to main branch.

Or deploy manually:
- `npm install` (if using build tools)
- Push `/docs` folder to any static hosting (GitHub Pages, Netlify, Vercel, etc.)

---

## ⚡ GPIO Pin Assignment

| GPIO | Function | Connection |
|------|----------|------------|
| **16** | Valve relay | NC+NO electrovalves (24V) + 10kΩ pull-down |
| **19** | Pump relay | 220V pump motor + 10kΩ pull-down |
| **33** | Temperature sensor | DS18B20 data line + 4.7kΩ pull-up |

---

## 📡 MQTT Topics

| Topic | Direction | Values | Description |
|-------|-----------|--------|-------------|
| `devices/esp32-pool-01/pump/set` | → ESP32 | `ON`, `OFF`, `TOGGLE` | Pump control |
| `devices/esp32-pool-01/pump/state` | ← ESP32 | `ON`, `OFF` | Current pump state |
| `devices/esp32-pool-01/valve/set` | → ESP32 | `1`, `2`, `TOGGLE` | Valve mode command |
| `devices/esp32-pool-01/valve/state` | ← ESP32 | `1`, `2` | Current valve mode |
| `devices/esp32-pool-01/timer/set` | → ESP32 | JSON: `{"mode":1,"duration":3600}` | Timer command |
| `devices/esp32-pool-01/timer/state` | ← ESP32 | JSON: `{"active":true,"remaining":...}` | Timer status |
| `devices/esp32-pool-01/temperature/state` | ← ESP32 | `25.3` | Temperature (°C) |
| `devices/esp32-pool-01/wifi/state` | ← ESP32 | JSON: `{"status":"connected",...}` | WiFi status |

### 1. Hardware Assembly


---

## ⏱️ Features Deep Dive

### Pump Toggle Switch
- **Blue toggle switch** with power icon labeled "Bomba"
- Quicksand font, animated transitions
- Slide to toggle pump ON/OFF
- Blue background (#001A72) when ON
- Grey background when OFF
- Automatically disabled during MQTT disconnection
- Detects conflicts with active programs

### Valve Mode Buttons
- **Two compact buttons**: Cascada (waterfall) and Eyectores (water jet)
- Click to switch between modes
- Active mode highlighted in blue with white text
- Mode 1: Cascada - NC valve open, NO valve closed
- Mode 2: Eyectores - NC valve closed, NO valve open

### Countdown Timer
- Opens timer configuration screen
- Select mode (Cascada or Eyectores)
- Set duration (hours and minutes)
- Start button begins countdown
- Timer displays on button with countdown HH:MM:SS
- Auto-stops pump when timer expires
- Cancels any active program

### Weekly Scheduler
- Create up to 3 programs
- Each program has schedules for each day
- Enable/disable programs with toggle
- Visual ring indicator when program is running
- Automatic execution every 15 minutes
- Manual override pauses until next day

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| ESP32 won't boot | Check 5V power, verify LM2596S output |
| WiFi won't connect | Check SSID/password in `secrets.h` |
| MQTT connection fails | Verify HiveMQ credentials and firewall |
| Relays don't click | Check 5V supply to relay modules |
| Temperature reads 0°C | Check DS18B20 wiring and pull-up resistor |
| Dashboard doesn't update | Verify MQTT topic subscriptions |
| Manual switches don't work | Check parallel wiring and relay contacts |

---

## 📚 Additional Documentation

- [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md) - Complete hardware wiring guide
- [README_POOL.md](README_POOL.md) - Detailed pool-specific documentation
- [WIFI_PROVISIONING.md](WIFI_PROVISIONING.md) - WiFiManager setup (feature branch)
- [DATABASE_MIGRATION.md](DATABASE_MIGRATION.md) - Historical data migration

---

## 📄 License

This project is provided as-is for personal use. No warranty. Use at your own risk.

---

## ⚠️ Safety Reminders

### BEFORE touching any wires:
1. **Turn OFF circuit breakers** for ALL pool equipment
2. **Verify power is OFF** with multimeter
3. **Wait 5 minutes** for capacitors to discharge
4. **Lock out/tag out** breaker panel if possible

### During installation:
- ❌ **NEVER work on live circuits** (220VAC is lethal)
- ❌ **NEVER bypass the 1A fuse**
- ✅ **ALWAYS use proper enclosure** (IP65 for wet locations)
- ✅ **ALWAYS label everything**

### If unsure:
- 🔌 **Hire a licensed electrician** for 220V work
- 📞 **Check local electrical codes**
- 🛑 **Stop if something looks wrong**

---

## 📧 Support

For issues or questions:
1. Review [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md) for hardware questions
2. Check [README_POOL.md](README_POOL.md) for detailed troubleshooting
3. Use [test_simulator.py](test_simulator.py) to test without hardware
4. Open GitHub issue with serial output and console errors

**Built with ☕ in 2025**
### Program Scheduling

#### Creating a Program
1. Click **"Programas"** button
2. Select an empty slot (1, 2, or 3)
3. Enable days by clicking day toggle buttons
4. For each enabled day:
   - Select mode (Cascada or Eyectores icon)
   - Set start time
   - Set stop time
5. Click **"Crear"** and enter program name
6. Program is automatically enabled

#### Program Priority
When multiple programs overlap:
- Slot 0 > Slot 1 > Slot 2 (first slot has priority)
- Alert shown for conflicts
- Only highest priority program executes

#### Manual Override
When you manually control pump/valves while a program is active:
- Alert: "⚠️ Conflicto con programa activo"
- Program pauses until next day (midnight reset)
- Programs resume automatically at 00:00

### Connection Status

#### WiFi Indicator
- **Icon color** indicates signal quality:
  - Green: Excellent (>= -50 dBm)
  - Blue: Good (>= -60 dBm)
  - Yellow: Fair (>= -70 dBm)
  - Orange: Weak (< -70 dBm)
  - Red: Disconnected
- Displays connected SSID

#### MQTT Indicator
- **Green animated dot**: Connected
- **Red static dot**: Disconnected
- Shows connection status text

#### Log Panel
- Shows real-time events with timestamps
- Color-coded messages:
  - ✅ Success (green)
  - ⚠️ Warnings (orange)
  - ❌ Errors (red)
  - ▶ Program execution
  - ■ Program stop
  - 🕐 Timer events
- **▼** button: Expand/collapse
- **🗑️** button: Clear log
- Auto-scrolls to latest entry
- Gradient fade at bottom for smooth UXgized
- Mode 2: Valve 2 (NC) energized

#### Log Panel
- Shows real-time events:
  - WiFi connection status
  - MQTT messages
  - State changes
  - Temperature readings
- **▼** button: Expand/collapse
- **🗑️** button: Clear log

### Manual Override

**Manual SPDT switches work in parallel with ESP32:**

1. **Scenario**: Dashboard shows pump OFF, but you flip manual switch → Pump turns ON
2. **ESP32 has no feedback** - it doesn't know about manual changes
3. **Both controls work independently** - OR logic (either manual OR ESP32 can activate)

**Note**: ESP32 operates "blind" - it sends commands but doesn't verify state. If manual switch is used, dashboard won't reflect the change.

---

## 🔧 Control Logic

### Pump Control (Standard Relay)

```cpp
// User clicks "Turn ON" in dashboard
1. Set GPIO 26 HIGH (relay closes)
2. Pump motor receives 220V AC power
3. Update internal state variable
4. Publish "ON" to MQTT pump/state topic
```

### Valve Control (Single Relay, NC+NO Parallel)

```cpp
// User clicks "Change to Mode 2"
1. Set GPIO 25 HIGH (relay energizes)
2. NC valve closes, NO valve opens (opposite polarity)
3. Water flow direction changes
4. Update internal mode variable
5. Publish "2" to MQTT valve/state topic
```

### Temperature Reading

**DS18B20 OneWire sensor on GPIO 21:**

```cpp
// Every 60 seconds in loop()
1. Request temperature from sensor
2. Wait for conversion (~750ms max)
3. Read temperature value (°C with 1 decimal)
4. Publish to MQTT temperature/state topic
```

---

## ⏰ Automatic Program Execution

The dashboard checks every 15 minutes if any enabled program should be running:

1. **Time Matching**: Compares current time against program schedules
2. **Day Matching**: JavaScript `Date.getDay()` matches schedule (0=Sunday, 1=Monday, etc.)
3. **Conflict Resolution**: Slot priority system (slot 0 beats slot 1 beats slot 2)
4. **MQTT Commands**: Publishes pump ON and valve mode commands
5. **Manual Override**: Detects user intervention and pauses until next day
6. **Midnight Reset**: Automatic resume at 00:00 after manual override

### Timer Synchronization

Timer state is synchronized between ESP32 and dashboard:
- ESP32 sends timer state updates every 10 seconds
- Dashboard displays countdown locally (1-second updates)
- Resync on reconnection prevents drift
- Stop command from either side stops both

### WiFi Fallback

ESP32 attempts connection to 3 networks in priority order:
1. Primary WiFi (WIFI_SSID)
2. Secondary WiFi (WIFI_SSID_2)
3. Tertiary WiFi (WIFI_SSID_3)

If all fail, periodic retry every 30 seconds.

### Custom Sensor Calibration

### Code Organization

All code files follow consistent structure with section separators:

**ESP32 Firmware** (`main.cpp`):
- Constants → State → Temperature Sensor → MQTT Publishing → Relay Control → Control Logic → Timer → MQTT Handler → WiFi → NTP → MQTT TLS → Setup/Loop

**JavaScript Modules** (`app.js`, `programas.js`):
- Constants → State → DOM Cache → Initialization → Event Listeners → Business Logic → Public API

**HTML** (`index.html`):
- Meta → Styles → Config → Header → Main Screen → Timer Screen → Programas Screen → Create Program Screen → Footer → Scripts

### ✅ Completed
- ✅ **Automatic program execution** - 15-minute interval checking with conflict resolution
- ✅ **Timer functionality** - Countdown with auto-shutoff and ESP32 sync
- ✅ **Manual override detection** - Pauses programs when user takes manual control
- ✅ **Code refactoring** - Comprehensive documentation and section separators
- ✅ **WiFi multi-network** - Automatic fallback to 3 configured networks
- ✅ **Custom waterfall icon** - SVG icon for Cascada mode
- ✅ **Responsive UI polish** - Smaller table sizes, improved spacing
- ✅ **Program scheduling** - Up to 3 weekly programs with per-day configuration
- ✅ **Conflict handling** - Timer cancellation, program priority, manual override
- ✅ **Signal strength monitoring** - Color-coded WiFi indicators

### 🚧 TODO / Future Enhancements

## 🚀 Future Enhancements

- [ ] **Critical** WiFi Provisioning / Captive Portal - Allow WiFi network selection at first boot without hard-coding credentials. ESP32 creates temporary access point, user connects and provides WiFi credentials through web interface
- [ ] Temperature alert thresholds (low/high water temp)
- [ ] OTA (Over-The-Air) firmware updates
- [ ] Historical data visualization and analytics
- [ ] Email/SMS notifications for critical events
- [ ] Integration with Home Assistant / Google Home
- [ ] Multiple device support (control multiple pools)
- [ ] Relay health monitoring (click count tracking)
---

## 📄 License

This project is provided as-is for personal use. No warranty. Use at your own risk.

## 🙏 Credits

- **MQTT.js**: Client library for browser-based MQTT
- **PubSubClient**: Arduino MQTT library
- **HiveMQ Cloud**: Free tier MQTT broker with TLS
- **PlatformIO**: ESP32 development environment

---

## 📧 Support

For issues or questions:
1. Review **WIRING_DIAGRAM.md** for hardware questions
2. Open GitHub issue with:
   - Serial monitor output
   - Photos of wiring (if hardware related)
   - Dashboard console errors (F12 in browser)

---

**Built with ☕ in 2025**
