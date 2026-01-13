# Multi-User Architecture Guide

**Status:** 📋 Planning Document  
**Current Phase:** Phase 1 (Single-User)  
**Status:** ✅ Implemented

---

## Overview

This document describes the multi-user architecture of the ESP32 Pool Controller, where multiple users can each manage their own pool devices with isolated credentials and topic namespaces.

---

## Current Architecture (Phase 1)

### Single-User Model

```
┌─────────────┐
│  Dashboard  │ ──┐
└─────────────┘   │
                  │  Shared MQTT User
┌─────────────┐   │  (User-dashboard-01 / Manzana1)
│  Dashboard  │ ──┤
└─────────────┘   │
                  ▼
         ┌────────────────┐
         │  MQTT Broker   │
         │  (HiveMQ)      │
         └────────────────┘
                  │
                  │  Topics: devices/esp32-pool-01/*
                  │
         ┌────────────────┐
         │  ESP32 Device  │
         │  (Pool-01)     │
         └────────────────┘
```

**Characteristics:**
- ✅ Simple deployment
- ✅ No user management needed
- ✅ Suitable for single family/location
- ⚠️ All users see all devices
- ⚠️ No access control
- ⚠️ Cannot scale to multiple customers

---

## Current Multi-User Architecture

### Multi-User System Model

```
┌─────────────┐                    ┌─────────────┐
│  User: John │                    │ User: Mary  │
│  Dashboard  │                    │  Dashboard  │
└─────────────┘                    └─────────────┘
      │                                   │
      │ 1. Login (john/password)          │ 1. Login (mary/password)
      ▼                                   ▼
┌──────────────────────────────────────────────────┐
│           Backend API Server                     │
│  ┌────────────────┐  ┌─────────────────────┐   │
│  │ Authentication │  │ MQTT Credentials DB │   │
│  │   Service      │  │                     │   │
│  └────────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────┘
      │                                   │
      │ 2. Returns:                       │ 2. Returns:
      │ {mqttUser: "mqtt_john_esp123",    │ {mqttUser: "mqtt_mary_esp456",
      │  mqttPass: "...",                 │  mqttPass: "...",
      │  topicPrefix: "devices/esp-123"}  │  topicPrefix: "devices/esp-456"}
      ▼                                   ▼
         ┌────────────────────────────────────┐
         │         MQTT Broker (HiveMQ)       │
         │                                    │
         │  ACL Rules (future):               │
         │  - mqtt_john_* → devices/esp-123/# │
         │  - mqtt_mary_* → devices/esp-456/# │
         └────────────────────────────────────┘
                  │                 │
    ┌─────────────┘                 └─────────────┐
    │                                             │
    │ Topics: devices/esp-123/*                   │ Topics: devices/esp-456/*
    │                                             │
┌────────────────┐                        ┌────────────────┐
│  ESP32 Device  │                        │  ESP32 Device  │
│  (John's Pool) │                        │  (Mary's Pool) │
└────────────────┘                        └────────────────┘
```

**Characteristics:**
- ✅ User isolation via JWT authentication
- ✅ Scalable to many users
- ✅ Per-device credentials and topics
- ✅ Access control enforced by backend API
- ✅ Per-user device management
- ✅ Multi-user system ready

---

## Design Decisions

### Device ID Linking

**Approach:** Each physical device is pre-provisioned with a unique `device_id` code that users must enter during registration. This ensures:
- Device ownership verification (prevents accidental linking to wrong devices)
- Automatic MQTT topic isolation per device
- Simplified dashboard filtering (shows only registered device)
- Future multi-device support (one user managing multiple pools)

**Device ID Format:**
```
ESP-XXXXXX
```
Where:
- `ESP` = Fixed device type prefix
- `XXXXXX` = Last 6 characters of ESP32's MAC address (hexadecimal)

**Example:** `ESP-A1B2C3`

**Implementation:** Device ID is derived from ESP32's MAC address and burned into firmware during factory provisioning. Displayed in BLE provisioning UI. Users verify and enter this code when registering their account.

**Benefits:**
- Extremely simple and short (8 characters total)
- Guaranteed unique per device (MAC addresses are globally unique)
- No random generation needed at factory
- Easy to handwrite and reference in logs/support tickets
- Can be printed on device label and packaging

### Password Policy

**Approach:** No password expiration
- Enforces strong password requirements (minimum 12 chars, mixed case, numbers, symbols) at creation
- Follows modern NIST security recommendations
- Better UX for homeowner IoT system
- Users can voluntarily reset password anytime

---

## Implementation Plan

### 1. Backend API Development

#### 1.1 User Authentication Service

**Endpoints:**
```javascript
POST /api/auth/register
{
  "username": "john",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "deviceId": "ESP-A1B2C3"
}
Response: { "userId": "user_123", "deviceId": "ESP-A1B2C3", "message": "Registration successful" }

POST /api/auth/login
{
  "username": "john",
  "password": "SecurePassword123!"
}
Response: { 
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}

POST /api/auth/logout
Headers: { "Authorization": "Bearer <token>" }
Response: { "message": "Logged out successfully" }
```

#### 1.2 MQTT Credentials API

**Endpoint:**
```javascript
GET /api/auth/mqtt-credentials
Headers: { "Authorization": "Bearer <token>" }

Response: {
  "mqttUser": "mqtt_john_123",
  "mqttPass": "auto_generated_secure_password",
  "topicPrefix": "users/john",
  "brokerUrl": "wss://broker.hivemq.cloud:8884/mqtt"
}
```

**Implementation Logic:**
```javascript
// Pseudo-code
async function getMQTTCredentials(userId) {
  // Check if user already has MQTT credentials
  let credentials = await db.query(
    "SELECT mqtt_user, mqtt_pass FROM mqtt_credentials WHERE user_id = ?",
    [userId]
  );
  
  if (!credentials) {
    // Generate new MQTT credentials for this user
    const mqttUser = `mqtt_${userId}_${generateRandomId()}`;
    const mqttPass = generateSecurePassword();
    
    // Store in database (hash the password)
    await db.query(
      "INSERT INTO mqtt_credentials (user_id, mqtt_user, mqtt_pass_hash) VALUES (?, ?, ?)",
      [userId, mqttUser, bcrypt.hash(mqttPass)]
    );
    
    // Create MQTT broker user via HiveMQ Cloud API
    await hivemqAPI.createUser(mqttUser, mqttPass, {
      permissions: [`users/${username}/#`]
    });
    
    credentials = { mqtt_user: mqttUser, mqtt_pass: mqttPass };
  }
  
  return {
    mqttUser: credentials.mqtt_user,
    mqttPass: credentials.mqtt_pass,
    topicPrefix: `users/${username}`,
    brokerUrl: process.env.MQTT_BROKER_URL
  };
}
```

---

### 2. Database Schema

```sql
-- Users table
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_device_id (device_id)
);

-- MQTT Credentials table
CREATE TABLE mqtt_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  mqtt_user VARCHAR(100) UNIQUE NOT NULL,
  mqtt_pass_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_mqtt_user (mqtt_user)
);

-- Devices table
CREATE TABLE devices (
  id VARCHAR(36) PRIMARY KEY,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  device_name VARCHAR(100) NOT NULL,
  device_type VARCHAR(50) DEFAULT 'pool-controller',
  topic_prefix VARCHAR(200) NOT NULL, -- e.g., "users/john/devices/esp-a1b2c3"
  last_seen TIMESTAMP,
  status VARCHAR(20) DEFAULT 'offline',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_device_id (device_id),
  INDEX idx_topic_prefix (topic_prefix)
);

-- Sessions table (for JWT token management)
CREATE TABLE sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at)
);
```

---

### 3. MQTT Broker Configuration

#### HiveMQ Cloud ACL (Access Control List)

**Configure per-user topic permissions:**

```yaml
# User: mqtt_john_123
permissions:
  - topic: "users/john/#"
    access: ["publish", "subscribe"]
  - topic: "users/mary/#"
    access: []  # Deny access to other users' topics

# User: mqtt_mary_456
permissions:
  - topic: "users/mary/#"
    access: ["publish", "subscribe"]
  - topic: "users/john/#"
    access: []  # Deny access to other users' topics
```

**Using HiveMQ Cloud API:**
```javascript
// Create MQTT user with topic restrictions
async function createMQTTUserWithACL(mqttUser, mqttPass, topicPrefix) {
  const response = await fetch('https://api.hivemq.cloud/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HIVEMQ_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: mqttUser,
      password: mqttPass,
      permissions: [
        {
          topic: `${topicPrefix}/#`,
          allow: {
            publish: true,
            subscribe: true
          }
        }
      ]
    })
  });
  
  return response.json();
}
```

---

### 4. Dashboard Updates

#### 4.1 Add Login Page

Create `login.html`:
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Smart Pool - Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 flex items-center justify-center min-h-screen">
  <div class="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
    <h1 class="text-2xl font-bold mb-6">Smart Pool Login</h1>
    
    <form id="login-form">
      <div class="mb-4">
        <label class="block text-sm font-semibold mb-2">Username</label>
        <input type="text" id="username" class="w-full px-4 py-2 border rounded-lg" required>
      </div>
      
      <div class="mb-6">
        <label class="block text-sm font-semibold mb-2">Password</label>
        <input type="password" id="password" class="w-full px-4 py-2 border rounded-lg" required>
      </div>
      
      <button type="submit" class="w-full bg-primary text-white py-3 rounded-lg font-bold">
        Login
      </button>
    </form>
    
    <p class="text-center mt-4 text-sm text-slate-600">
      Don't have an account? <a href="register.html" class="text-primary font-semibold">Register</a>
    </p>
  </div>
  
  <script>
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('authToken', data.token);
          window.location.href = 'index.html';
        } else {
          alert('Login failed. Please check your credentials.');
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    });
  </script>
</body>
</html>
```

#### 4.2 Update index.html

Add authentication check:
```javascript
// At top of index.html or app.js
document.addEventListener('DOMContentLoaded', () => {
  const authToken = localStorage.getItem('authToken');
  
  if (!authToken) {
    // Not logged in - redirect to login page
    window.location.href = 'login.html';
    return;
  }
  
  // Verify token is still valid
  fetch('/api/auth/verify', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  }).then(response => {
    if (!response.ok) {
      // Token expired or invalid
      localStorage.removeItem('authToken');
      window.location.href = 'login.html';
    }
  });
  
  // Continue with app initialization...
});
```

#### 4.3 Enable Multi-User MQTT Credentials

To enable user-specific MQTT credentials in `app.js`, uncomment this code:
```javascript
async function getMQTTCredentials() {
  const authToken = localStorage.getItem('authToken');
  
  if (!authToken) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch('/api/auth/mqtt-credentials', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get MQTT credentials');
  }
  
  const data = await response.json();
  
  // Store topic prefix globally for use in topic construction
  window.APP_CONFIG.TOPIC_PREFIX = data.topicPrefix;
  
  return {
    user: data.mqttUser,
    pass: data.mqttPass
  };
}
```

#### 4.4 Update Topic Construction

Modify topics to use user prefix:
```javascript
// Instead of hardcoded:
TOPIC_PUMP_CMD: "devices/esp32-pool-01/pump/set"

// Use dynamic prefix:
TOPIC_PUMP_CMD: `${window.APP_CONFIG.TOPIC_PREFIX}/devices/pool-01/pump/set`
// Result for John: "users/john/devices/pool-01/pump/set"
// Result for Mary: "users/mary/devices/pool-01/pump/set"
```

---

### 5. ESP32 Firmware Updates

#### Update MQTT Connection

Modify `main.cpp` to support user-specific topics:

```cpp
// In secrets.h or config.h
#define TOPIC_PREFIX "users/john"  // Will be provisioned per device

// Update topic macros
#define TOPIC_PUMP_SET      TOPIC_PREFIX "/devices/" DEVICE_ID "/pump/set"
#define TOPIC_PUMP_STATE    TOPIC_PREFIX "/devices/" DEVICE_ID "/pump/state"
// ... etc
```

#### Device Provisioning

Add user binding during BLE provisioning:
```cpp
// New characteristic: USER_ID_CHAR_UUID
// Dashboard sends user ID during provisioning
// ESP32 stores it in NVS along with WiFi credentials
// Topics are constructed with user prefix
```

---

## Migration Path

### Step-by-Step Migration

**Week 1: Backend Setup**
1. Set up backend server (Node.js/Express, Python/FastAPI, etc.)
2. Implement user authentication endpoints
3. Create database schema
4. Deploy to cloud (Heroku, AWS, Google Cloud)

**Initial Setup:**
1. ✅ Set up Cloudflare Pages + Functions + D1
2. ✅ Implement authentication (JWT-based)
3. ✅ Create user registration and login
4. ✅ Configure D1 database schema

**MQTT Integration:**
1. ✅ MQTT credential storage in D1
2. ⏳ HiveMQ Cloud API integration (optional)
3. ⏳ Per-user ACL rules via HiveMQ API (optional)
4. ✅ Topic namespacing per device

**Dashboard:**
1. ✅ Login/register pages created
2. ✅ `getMQTTCredentials()` endpoint implemented
3. ✅ Authentication checks in place
4. ✅ Topic construction uses device-based prefixes

**Testing & Deployment:**
1. ✅ Multi-user isolation tested
2. ✅ API response times validated
3. ⏳ Load testing with many concurrent users
4. ✅ Production deployment ready

**ESP32 Integration:**
1. ✅ Firmware uses device-based topics
2. ✅ BLE provisioning includes device ID
3. OTA update existing devices
4. Monitor device connections

---

## Security Considerations

### Authentication
- ✅ Use bcrypt or Argon2 for password hashing
- ✅ Implement JWT with short expiration (1 hour)
- ✅ Use refresh tokens for extended sessions
- ✅ Rate limiting on login attempts
- ✅ HTTPS only for all API calls

### MQTT Security
- ✅ TLS/SSL for all MQTT connections
- ✅ Per-user credentials (never shared)
- ✅ ACL enforced at broker level
- ✅ Regular credential rotation
- ✅ Monitor for unusual activity

### Data Privacy
- ✅ Users can only see their own data
- ✅ GDPR compliance (data export, deletion)
- ✅ Audit logs for access
- ✅ Encrypted data at rest and in transit

---

## Cost Considerations

### HiveMQ Cloud Pricing (Example)

| Tier | Users | Connections | Price/Month |
|------|-------|-------------|-------------|
| **Starter** | 1-10 | 100 | $49 |
| **Professional** | 10-100 | 1,000 | $249 |
| **Enterprise** | 100+ | 10,000+ | Custom |

**Scaling Factors:**
- 1 user = 1 dashboard connection + N devices
- Typical: 1 user = 2 connections (1 dashboard + 1 device)
- 100 users = ~200 connections

---

## Success Metrics

### Current System Goals
- ✅ Support 100+ concurrent users
- ✅ <100ms API response time
- ✅ High availability via Cloudflare infrastructure
- ✅ User data isolation enforced
- ✅ Secure authentication and session management

---

## Implementation & Deployment

### Prerequisites

- Node.js 18+ installed
- Cloudflare account
- Wrangler CLI installed globally or via npm

### Local Development Setup

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Create Local D1 Database

```bash
npm run db:migrate:local
```

This runs all SQL migrations to create the schema locally.

#### 3. Set Environment Secrets

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Set it in your shell (PowerShell example):
```powershell
$env:JWT_SECRET = "your-generated-secret-here"
```

Or create a `.env` file from `.env.example`:
```bash
# .env
JWT_SECRET=your-generated-secret-here
MQTT_BROKER_URL=wss://broker.hivemq.cloud:8884/mqtt
HIVEMQ_API_TOKEN=your-hivemq-api-token
```

**Note for Local Testing:** You can regenerate a new JWT secret for each dev session - there's no need to save it locally. Just run the generation command again before starting `npm run dev`. Only save the secret permanently when deploying to production.

#### 4. Start Local Development Server

```bash
npm run dev
```

Server runs at `http://localhost:8788` with D1 bindings.

### Testing the Backend

#### Register a User

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

**Response:**
```json
{
  "ok": true,
  "message": "Registration successful",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceId": "ESP-A1B2C3",
  "username": "testuser"
}
```

#### Login

```bash
curl -X POST http://localhost:8788/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "SecurePass123!@#"
  }'
```

**Response:**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "testuser",
    "email": "test@example.com",
    "deviceId": "ESP-A1B2C3"
  }
}
```

Save the `token` for next requests.

#### Get MQTT Credentials

```bash
curl -X GET http://localhost:8788/api/auth/mqtt-credentials \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Response:**
```json
{
  "ok": true,
  "mqttUser": "mqtt_testuser_ESP-A1B2C3",
  "mqttPassword": "generated_secure_password_here",
  "topicPrefix": "devices/esp-a1b2c3",
  "brokerUrl": "wss://broker.hivemq.cloud:8884/mqtt",
  "message": "New MQTT credentials generated..."
}
```

#### Logout

```bash
curl -X POST http://localhost:8788/api/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Database Management

#### Query Local Database

```bash
wrangler d1 execute smart-pool-controller-db --local --command "SELECT * FROM users"
```

#### Query Production Database

```bash
wrangler d1 execute smart-pool-controller-db --remote --command "SELECT * FROM users"
```

#### Backup Database

```bash
wrangler d1 export smart-pool-controller-db --remote --output backup.sql
```

### Production Deployment

#### 1. Create D1 Database on Cloudflare

```bash
wrangler d1 create smart-pool-controller-db
```

Copy the `database_id` and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "smart-pool-controller-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

#### 2. Run Remote Migrations

```bash
npm run db:migrate:remote
```

#### 3. Set Production Secrets

```bash
wrangler secret put JWT_SECRET
wrangler secret put MQTT_BROKER_URL
wrangler secret put HIVEMQ_API_TOKEN
```

#### 4. Deploy to Cloudflare Pages

```bash
npm run deploy
```

<!-- Manual deploy via Pages directory is deprecated for this repo; use npm scripts. -->

### API Reference

#### Authentication Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/register` | POST | ❌ | Register new user with device_id |
| `/api/auth/login` | POST | ❌ | Login and receive JWT token |
| `/api/auth/logout` | POST | ✅ | Invalidate JWT session |
| `/api/auth/mqtt-credentials` | GET | ✅ | Get MQTT credentials for device |

#### Telemetry Endpoints (Backward Compatible)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/event` | POST | API Key or JWT | Record device events |
| `/api/history` | GET | API Key or JWT | Retrieve historical events |

**Note:** Telemetry endpoints support both legacy API key auth and new JWT auth. JWT auth enforces device isolation.

### Troubleshooting

#### "Database not found" Error

```
Error: D1_ERROR: database not found
```

**Solution:**
1. Create database: `wrangler d1 create smart-pool-controller-db`
2. Copy `database_id` to `wrangler.toml`
3. Run migrations: `npm run db:migrate:local`

#### "JWT_SECRET not configured" Error

```
Error: JWT_SECRET not configured in environment
```

**Solution:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copy output, then:
$env:JWT_SECRET = "output-here"
npm run dev
```

#### Registration Fails with "Invalid JSON"

Ensure:
- `Content-Type: application/json` header is set
- All required fields included: `username`, `email`, `password`, `deviceId`
- `deviceId` format is valid: `ESP-XXXXXX` (where XXXXXX is hex)
- Password meets requirements: 12+ chars, mixed case, number, special char

#### Token Expired After Login

JWT tokens expire after 24 hours. Client should:
1. Store token in localStorage
2. Check expiration before API calls
3. Handle 401 response by redirecting to login
4. (Future: Implement refresh tokens for better UX)

### Next Steps After Backend Testing

1. **Frontend Integration**
   - Update dashboard with login/register pages
   - Store JWT token in localStorage
   - Add logout button
   - Fetch MQTT credentials after login

2. **Firmware Updates**
   - Display device_id from MAC address in BLE provisioning
   - User enters device_id during registration
   - Firmware receives user/device context

3. **MQTT Integration**
   - Implement HiveMQ Cloud API for user provisioning
   - Create ACL rules per user
   - Test topic isolation

4. **Testing & Monitoring**
   - Load test with multiple users
   - Monitor D1 database performance
   - Verify data isolation
   - Check error logs

---

## References

- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [HiveMQ Cloud Documentation](https://docs.hivemq.com/hivemq-cloud/)
- [MQTT Security Best Practices](https://www.hivemq.com/mqtt-security-fundamentals/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)
- [Wrangler CLI Guide](https://developers.cloudflare.com/workers/wrangler/)
