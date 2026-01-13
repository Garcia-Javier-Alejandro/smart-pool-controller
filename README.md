# Smart Pool Controller (Multi-User)

Multi-user pool controller stack: Cloudflare Pages (SPA) + Cloudflare Pages Functions + D1 database + ESP32 firmware + HiveMQ MQTT. Users authenticate, receive per-user MQTT credentials and topic namespaces, and control one or more ESP32 pool controllers through the web dashboard.

**Status**: ✅ Production-ready multi-user system  
**Last Updated**: January 9, 2026  
**License**: CC BY-NC 4.0 (non-commercial use)

---

## 📦 What’s Included

- Frontend SPA (index.html, app.js, styles.css, _redirects) served by Cloudflare Pages
- Auth + device APIs via Cloudflare Pages Functions
- D1 database schema (users, mqtt_credentials, devices, sessions) for multi-user isolation
- MQTT broker integration (tested with HiveMQ Cloud) with per-user credentials and topic prefixes
- ESP32 firmware (PlatformIO) for pump/valve control, temperature sensing, timer/program logic
- CC BY-NC 4.0 license (non-commercial)

---

## 🏗️ Architecture

- **SPA**: Served from root; `_redirects` sends all routes to index.html
- **APIs (Functions)**:
  - [functions/api/auth/register.js](functions/api/auth/register.js)
  - [functions/api/auth/login.js](functions/api/auth/login.js)
  - [functions/api/auth/logout.js](functions/api/auth/logout.js)
  - [functions/api/auth/mqtt-credentials.js](functions/api/auth/mqtt-credentials.js)
  - [functions/api/event.js](functions/api/event.js)
  - [functions/api/history.js](functions/api/history.js)
- **Auth core**: [functions/_shared/multiUserAuth.js](functions/_shared/multiUserAuth.js), [functions/_shared/auth.js](functions/_shared/auth.js)
- **Database (D1)**: migrations for users, mqtt_credentials, devices, sessions in [migrations](migrations)
- **MQTT**: Per-user credentials + topic namespace; broker: HiveMQ Cloud (or compatible)
- **Firmware**: PlatformIO project in [firmware](firmware) (GPIO control, MQTT client, timers, DS18B20)

Data flow (multi-user):
1) User registers/logs in → receives JWT
2) Dashboard calls `/api/auth/mqtt-credentials` → gets mqttUser, mqttPass, topicPrefix, broker URL
3) Dashboard connects to MQTT over WSS using those credentials
4) Commands/state flow on `topicPrefix/...` topics to the user’s devices
5) Events/history stored via Functions + D1 (extensible; placeholders provided)

---

## 🚀 Quickstart (Multi-User)

**Prereqs**: Node 18+, `wrangler` CLI, Cloudflare account, MQTT broker.

1) Clone the repo
2) Create the D1 database and run migrations
3) Set required secrets (JWT, broker URL, etc.)
4) Run locally: `npm run dev`
5) Deploy: `npm run deploy`

Detailed steps and troubleshooting: see [docs/SETUP.md](docs/SETUP.md).

---

## 🔌 API Surface (Functions)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/register` | POST | None | Create user account |
| `/api/auth/login` | POST | None | Issue JWT + session |
| `/api/auth/logout` | POST | Bearer | Revoke session |
| `/api/auth/mqtt-credentials` | GET | Bearer | Return per-user MQTT creds + topicPrefix |
| `/api/event` | POST | Bearer/API key | Log device events (extend to store in D1/KV) |
| `/api/history` | GET | Bearer/API key | Fetch history (placeholder; wire to D1/KV) |

`mqtt-credentials` response (example):
```json
{
  "mqttUser": "u_abc123",
  "mqttPass": "s3cr3t",
  "topicPrefix": "users/abc123/devices/pool-01",
  "broker": "wss://<your-hivemq-host>:8884/mqtt",
  "expiresAt": 1735689600000
}
```

---

## 📡 MQTT Topic Model

All topics are namespaced per user/device using `topicPrefix` from `mqtt-credentials`:

| Topic | Direction | Description |
|-------|-----------|-------------|
| `{topicPrefix}/pump/set` | → device | Pump command (`ON`/`OFF`/`TOGGLE`) |
| `{topicPrefix}/pump/state` | ← device | Pump state (`ON`/`OFF`) |
| `{topicPrefix}/valve/set` | → device | Valve mode (`1`/`2`/`TOGGLE`) |
| `{topicPrefix}/valve/state` | ← device | Valve mode (`1`/`2`) |
| `{topicPrefix}/timer/set` | → device | JSON timer command |
| `{topicPrefix}/timer/state` | ← device | JSON timer status |
| `{topicPrefix}/temperature/state` | ← device | Water temp (°C) |
| `{topicPrefix}/wifi/state` | ← device | WiFi status JSON |

Align `deviceId`/topic prefix in firmware config with the prefix returned by the backend for that device.

---

## 🛠️ Firmware (ESP32)

- Location: [firmware](firmware)
- Configure credentials in [firmware/include/secrets.h](firmware/include/secrets.h) (not committed); use the example template
- Set MQTT topics/device ID in [firmware/include/config.h](firmware/include/config.h)
- Build/flash: `cd firmware && pio run --target upload`
- Hardware: pump relay, valve relay (NC/NO), DS18B20 temperature sensor; GPIO mappings in config.h

---

## 🗄️ Database

- Migrations: [migrations](migrations)
  - `0001_create_users_table.sql`
  - `0002_create_mqtt_credentials_table.sql`
  - `0003_create_devices_table.sql`
  - `0004_create_sessions_table.sql`
- Scripts (see [package.json](package.json)):
  - `npm run db:create` (optional helper)
  - `npm run db:migrate:local`
  - `npm run db:migrate:remote`

---

## 🛡️ Security Notes

- JWT-based sessions; rotate `JWT_SECRET` periodically
- Per-user MQTT credentials and topic namespaces to isolate tenants
- Use TLS (WSS 8884) to the MQTT broker
- Do not commit `secrets.h` or any generated credentials
- Optional API key support for device-to-cloud calls

---

## 📂 Key Files

- Frontend: [index.html](index.html), [app.js](app.js), [css/styles.css](css/styles.css), [_redirects](_redirects)
- Backend functions: [functions/api](functions/api)
- Auth core: [functions/_shared](functions/_shared)
- Firmware: [firmware/src/main.cpp](firmware/src/main.cpp), [firmware/include/config.h](firmware/include/config.h)
- Database: [migrations](migrations)
- Config: [wrangler.toml](wrangler.toml), [package.json](package.json)
- License: [LICENSE](LICENSE) (CC BY-NC 4.0)

---

## 📚 Docs

- Setup Guide: [docs/SETUP.md](docs/SETUP.md)
- Device Provisioning: [docs/DEVICE_PROVISIONING.md](docs/DEVICE_PROVISIONING.md)
- Telemetry Strategy: [docs/TELEMETRY_STRATEGY.md](docs/TELEMETRY_STRATEGY.md)
- Wiring Diagram: [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md)

---

## 📜 License

Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0). Non-commercial use only.

---

## 💬 Support

- Use GitHub issues with details (browser console, function logs, firmware serial output)
- Verify D1 migrations and secrets are configured before filing runtime issues

**Built with ☕**
