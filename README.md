# Smart Pool Controller

## Control Your Pool Remotely

**Smart Pool Controller** is an easy-to-use system that lets you manage your pool from anywhere. Switch your pump on and off, control water flow valves, set timers, and schedule programs—all from your smartphone or computer.

### What You Can Do

**Instant Control**
- Turn pump on/off with a single tap
- Switch between water modes (cascade vs jets) instantly
- View real-time pump and valve status

**Smart Scheduling**
- Create up to 3 daily programs (e.g., filter at 6 AM, jets at 3 PM)
- Set timers for timed watering or circulation
- Program runs automatically based on your schedule

**Track Your Pool**
- See temperature readings in real-time
- View event history (when pump started/stopped)
- Monitor WiFi connection status

**Multi-User & Secure**
- Each family member gets their own login account
- Access control ensures privacy
- All communication is encrypted

---

## How It Works

The system connects a small ESP32 microcontroller (installed in your pool equipment) to the internet via WiFi. This device communicates with our cloud backend, which serves a mobile-friendly web dashboard. You control everything through the dashboard—no app installation needed, just open it in your browser.

**Key Components:**
- **Dashboard** - Web app you use to control your pool (works on phone, tablet, computer)
- **Cloud Backend** - Secure server that handles accounts, device communication, and schedules
- **ESP32 Controller** - Small computer that directly controls your pump and valves
- **MQTT Network** - Secure messaging system that keeps your dashboard and devices in sync

---

## Features

- **One-tap control** - Pump and valve switching in real-time
- **Weekly schedules** - Set up to 3 automated programs per week
- **Smart timers** - Countdown timers for temporary operations
- **Temperature monitoring** - Track water temperature with DS18B20 sensor
- **Mobile-ready** - Responsive design works on phones, tablets, and desktops
- **Multi-account support** - Family members can each have their own login
- **Event history** - See when and how often your pump ran
- **Cloud-based** - Accessible from anywhere with internet
- **Automatic backups** - Your schedules are saved in the cloud

---

## Getting Started

### For End Users (Just Want to Use It)

1. **Access the Dashboard**: Open the provided URL in your browser
2. **Register/Login**: Create an account or log in with your credentials
3. **Connect Your Device**: Follow BLE provisioning to connect your ESP32 controller to WiFi
4. **Start Controlling**: Use the dashboard to control your pump and valves

Full user guide: See [docs/DEVICE_PROVISIONING.md](docs/DEVICE_PROVISIONING.md)

### For Developers (Want to Deploy/Modify)

This is a complete full-stack solution built on modern cloud infrastructure:
- **Frontend**: Cloudflare Pages (SPA) - serves your dashboard
- **Backend**: Cloudflare Pages Functions - handles accounts and device communication  
- **Database**: Cloudflare D1 - stores user accounts and history
- **Messaging**: HiveMQ MQTT broker - real-time device communication
- **Hardware**: ESP32 microcontroller running custom firmware

**Setup Instructions**: See [docs/SETUP.md](docs/SETUP.md) for detailed deployment guide.

---

## System Status

- **Status**: Production-ready
- **Users**: Multi-user with per-account login
- **License**: CC BY-NC 4.0 (non-commercial use)
- **Last Updated**: January 12, 2026

---

## Technical Overview

For developers interested in the architecture:

### Components

- **Frontend SPA** ([index.html](index.html), [js/app.js](js/app.js)) - Responsive dashboard
- **Authentication** - User registration, login, session management
- **Device APIs** - Register devices, control operations, fetch history
- **Database** - Multi-user isolation with D1 (users, devices, sessions, events)
- **MQTT Integration** - Per-user credentials, real-time state sync
- **ESP32 Firmware** - GPIO control, sensor reading, WiFi provisioning

### APIs (Cloud Functions)

| Endpoint | Purpose |
|----------|---------|
| `/api/auth/register` | Create user account |
| `/api/auth/login` | User authentication |
| `/api/auth/mqtt-credentials` | Get device connection details |
| `/api/event` | Log device events |
| `/api/history` | Retrieve event history |

### Data Model

Each user has:
- Login credentials (email/password)
- One or more registered ESP32 devices
- Unique MQTT credentials for secure device communication
- Automated program schedules

### MQTT Topics

Commands and state flow on topic paths like:
- `devices/{deviceId}/pump/set` → Device
- `devices/{deviceId}/pump/state` ← Device
- `devices/{deviceId}/valve/set` → Device
- `devices/{deviceId}/timer/set` → Device

---

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)** - Complete installation & deployment guide
- **[docs/DEVICE_PROVISIONING.md](docs/DEVICE_PROVISIONING.md)** - WiFi setup & device pairing
- **[docs/TELEMETRY_STRATEGY.md](docs/TELEMETRY_STRATEGY.md)** - Data storage & scalability
- **[MULTI_USER_ARCHITECTURE.md](MULTI_USER_ARCHITECTURE.md)** - System design & security
- **[WIRING_DIAGRAM.md](WIRING_DIAGRAM.md)** - ESP32 hardware connections

### Key Files

- **Frontend**: [index.html](index.html), [js/app.js](js/app.js), [css/styles.css](css/styles.css)
- **Backend Functions**: [functions/api](functions/api), [functions/_shared](functions/_shared)
- **Firmware**: [firmware/src/main.cpp](firmware/src/main.cpp), [firmware/include/config.h](firmware/include/config.h)
- **Database**: [migrations](migrations)
- **Configuration**: [wrangler.toml](wrangler.toml), [package.json](package.json)

---

## License

CC BY-NC 4.0 (Non-Commercial) - You can use, modify, and share this for non-commercial purposes. For commercial use, please contact the author.

See [LICENSE](LICENSE) for full details.

---

## Questions?

- Check the [docs](docs) folder for detailed guides
- Review code comments for implementation details
- See [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md) for hardware setup

**Built with ☕ in 2026**
