# Phase 2: Multi-Tenant Architecture - Setup Guide

## Overview

This guide covers the setup and deployment of the multi-tenant authentication system for the IoT Pool Controller.

## Prerequisites

- Node.js 18+ installed
- Cloudflare account
- Wrangler CLI installed globally or via npm

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create D1 Database

```bash
# Create the database on Cloudflare
npm run db:create

# Or manually:
wrangler d1 create iot-pool-controller-db
```

Copy the `database_id` from the output and update it in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "iot-pool-controller-db"
database_id = "YOUR_DATABASE_ID_HERE"  # Replace with actual ID
```

### 3. Run Database Migrations

**Local development:**
```bash
npm run db:migrate:local
```

**Production (Cloudflare):**
```bash
npm run db:migrate:remote
```

### 4. Set Environment Secrets

```bash
# JWT Secret (generate a random 64-character string)
wrangler secret put JWT_SECRET
# Enter: <random-64-char-string>

# MQTT Broker URL
wrangler secret put MQTT_BROKER_URL
# Enter: wss://broker.hivemq.cloud:8884/mqtt

# HiveMQ API Token (for auto-provisioning MQTT users)
wrangler secret put HIVEMQ_API_TOKEN
# Enter: <your-hivemq-api-token>
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Development

### Run Local Development Server

```bash
npm run dev
```

This starts a local server at `http://localhost:8788` with D1 database bindings.

### Test Endpoints

**Register a new user:**
```bash
curl -X POST http://localhost:8788/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "SecurePass123!@#",
    "deviceId": "ESP-A1B2C3"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:8788/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "SecurePass123!@#"
  }'
```

**Get MQTT Credentials:**
```bash
curl -X GET http://localhost:8788/api/auth/mqtt-credentials \
  -H "Authorization: Bearer <token-from-login>"
```

**Logout:**
```bash
curl -X POST http://localhost:8788/api/auth/logout \
  -H "Authorization: Bearer <token-from-login>"
```

## Database Management

### Query Database (Local)

```bash
wrangler d1 execute iot-pool-controller-db --local --command "SELECT * FROM users"
```

### Query Database (Production)

```bash
wrangler d1 execute iot-pool-controller-db --remote --command "SELECT * FROM users"
```

### Backup Database

```bash
wrangler d1 export iot-pool-controller-db --remote --output backup.sql
```

## Deployment

### Deploy to Cloudflare Pages

```bash
npm run deploy
```

Or manually:

```bash
wrangler pages deploy docs
```

### Post-Deployment

1. Run remote migrations (if not done):
   ```bash
   npm run db:migrate:remote
   ```

2. Set production secrets (if not done):
   ```bash
   wrangler secret put JWT_SECRET
   wrangler secret put MQTT_BROKER_URL
   wrangler secret put HIVEMQ_API_TOKEN
   ```

## API Endpoints

### Authentication

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/auth/register` | POST | No | Register new user with device_id |
| `/api/auth/login` | POST | No | Login and receive JWT token |
| `/api/auth/logout` | POST | Yes | Invalidate JWT session |
| `/api/auth/mqtt-credentials` | GET | Yes | Get MQTT credentials for user's device |

### Existing Endpoints

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/event` | POST | API Key | Record device events (telemetry) |
| `/api/history` | GET | API Key | Retrieve historical events |

## Database Schema

### Tables

- **users** - User accounts with device_id linking
- **mqtt_credentials** - Per-user MQTT credentials
- **devices** - Device metadata (low-write data)
- **sessions** - JWT token sessions

See `migrations/` directory for full schema.

## Security Notes

### Password Requirements

- Minimum 12 characters
- Must contain: uppercase, lowercase, number, special character
- No expiration policy (follows NIST recommendations)

### Device ID Format

- Format: `ESP-XXXXXX`
- XXXXXX = Last 6 hex characters of ESP32 MAC address
- Example: `ESP-A1B2C3`

### JWT Tokens

- Expire after 24 hours
- Stored in sessions table (can be invalidated)
- Include user info and device_id

## Telemetry Strategy

**D1 Database (Low-write):**
- User accounts
- Device metadata
- MQTT credentials
- Configuration flags

**External Storage (High-write):**
- Raw telemetry/events
- Time-series data
- Logs

Consider migrating `/api/event` to use Cloudflare Workers KV, Durable Objects, or external time-series DB for high-frequency writes.

## Troubleshooting

### "Database not found" error

Make sure you've created the D1 database and updated `wrangler.toml` with the correct `database_id`.

### "JWT_SECRET not configured" error

Set the JWT secret:
```bash
wrangler secret put JWT_SECRET
```

### Migration fails

Check migration order and syntax. Run migrations one by one if needed:
```bash
wrangler d1 execute iot-pool-controller-db --local --file=./migrations/0001_create_users_table.sql
```

## Next Steps

1. ✅ Backend authentication API complete
2. ⏳ Update dashboard to use authentication
3. ⏳ Update ESP32 firmware to display device_id
4. ⏳ Implement HiveMQ Cloud API integration
5. ⏳ Migrate event API to support multi-tenant topics
6. ⏳ Add user dashboard for device management

## Resources

- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
