# Scaling Guide: Single-User → Multi-User Architecture

## Current State (PHASE 1): Single-User Hardcoded Credentials

The dashboard is currently configured for **single-user mode** with hardcoded MQTT credentials in the code. The login UI is hidden and the app auto-connects on page load.

### Architecture

```
User Browser → MQTT Broker (HiveMQ Cloud) → ESP32 Devices
  (Direct connection with hardcoded credentials)
```

### Implementation Details

**Credential Provider** (`docs/js/app.js`):
```javascript
async function getMQTTCredentials() {
  // PHASE 1: Hardcoded credentials
  return {
    user: 'User-dashboard-01',
    pass: 'Manzana1'
  };
}
```

**Auto-Connect**: On page load, app calls `getMQTTCredentials()` and connects automatically
**Login UI**: Hidden via `elements.loginCard.style.display = 'none'`

---

## Future State (PHASE 2): Multi-User with Backend Authentication

### Recommended Architecture: Backend API + User Authentication

```
User Browser → API Server → MQTT Broker → ESP32 Devices
             (Auth/DB)      (Per-user topics)
```

### Migration Steps

#### 1. Backend Setup

Create a simple backend API (Node.js/Express, Python/Flask, etc.) with endpoints:

**Authentication:**
```
POST /api/auth/login
  Body: { email, password }
  Returns: { token, user }

POST /api/auth/logout
  Headers: { Authorization: Bearer <token> }
```

**MQTT Credentials:**
```
GET /api/mqtt-credentials
  Headers: { Authorization: Bearer <token> }
  Returns: { mqttUser, mqttPass }
```

**Device Management:**
```
GET /api/user/devices
  Returns: [{ id, name, type, lastSeen }]

POST /api/devices/pair
  Body: { deviceId, pairingCode }
```

#### 2. Update Credential Provider

**Uncomment PHASE 2 code in `getMQTTCredentials()`:**

```javascript
async function getMQTTCredentials() {
  /* PHASE 1: Remove this
  return {
    user: 'User-dashboard-01',
    pass: 'Manzana1'
  };
  */
  
  // PHASE 2: Backend API
  try {
    const response = await fetch('/api/mqtt-credentials', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch MQTT credentials');
    }
    
    const credentials = await response.json();
    return {
      user: credentials.mqttUser,
      pass: credentials.mqttPass
    };
  } catch (error) {
    console.error('[Auth] Failed to get MQTT credentials:', error);
    throw new Error('Authentication failed. Please login again.');
  }
}
```

#### 3. Show Login UI

**Remove auto-hide in `init()` function:**

```javascript
// PHASE 1: Comment out or remove
// if (elements.loginCard) {
//   elements.loginCard.style.display = 'none';
// }

// PHASE 2: Show login card until user authenticates
if (elements.loginCard) {
  elements.loginCard.style.display = 'block';
}
```

#### 4. Update MQTT Topics (Namespace by User)

**Current topics:**
```
devices/pool-5a00/pump/set
devices/pool-5a00/pump/state
```

**Multi-user topics:**
```
users/{userId}/devices/pool-5a00/pump/set
users/{userId}/devices/pool-5a00/pump/state
```

**Update in `config.js`:**
```javascript
// Get userId from localStorage or API
const userId = getUserId(); // e.g., "user-123"

const APP_CONFIG = {
  // ...
  TOPIC_PUMP_CMD: `users/${userId}/devices/${DEVICE_ID}/pump/set`,
  TOPIC_PUMP_STATE: `users/${userId}/devices/${DEVICE_ID}/pump/state`,
  // ...
};
```

#### 5. Implement MQTT ACLs (HiveMQ Cloud)

Configure broker ACLs so each user can only pub/sub to their own namespace:

```
User: user-123-mqtt
  Allow Publish: users/user-123/#
  Allow Subscribe: users/user-123/#
  Deny: users/+/# (other users' topics)
```

#### 6. Add Token Management

Create helper functions for JWT/session management:

```javascript
function getAuthToken() {
  return localStorage.getItem('authToken');
}

function setAuthToken(token) {
  localStorage.setItem('authToken', token);
}

function clearAuthToken() {
  localStorage.removeItem('authToken');
}

function isAuthenticated() {
  const token = getAuthToken();
  if (!token) return false;
  
  // Check token expiry
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.exp * 1000 > Date.now();
}
```

---

## Alternative: MQTT-Only Multi-User (Simpler but Less Secure)

If you want to avoid a full backend, you can use MQTT broker features:

1. **Per-user MQTT credentials** created manually in HiveMQ Cloud
2. **Topic namespacing** with ACLs as shown above
3. **Device pairing** via BLE (ESP32 gets user's MQTT credentials during provisioning)

**Pros:** Simpler, no backend required
**Cons:** MQTT credentials in browser, harder to add features like billing/analytics

---

## Database Schema (For PHASE 2)

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  mqtt_username VARCHAR(255) UNIQUE NOT NULL,
  mqtt_password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Devices table
CREATE TABLE devices (
  id VARCHAR(50) PRIMARY KEY, -- e.g., "pool-5a00"
  owner_id UUID REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- "pool-controller"
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Device sharing (optional)
CREATE TABLE device_shares (
  id UUID PRIMARY KEY,
  device_id VARCHAR(50) REFERENCES devices(id),
  user_id UUID REFERENCES users(id),
  permission VARCHAR(20) NOT NULL, -- "read-only", "control"
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Security Considerations

### PHASE 1 (Current)
- ⚠️ **Hardcoded credentials exposed** in JavaScript (not suitable for production multi-user)
- ✅ OK for single user or trusted environment
- ✅ MQTT over TLS (encrypted communication)

### PHASE 2 (Future)
- ✅ **Credentials server-side** (not exposed to browser)
- ✅ **JWT tokens** with expiry (short-lived, refreshable)
- ✅ **HTTPS required** for API calls
- ✅ **MQTT ACLs** prevent cross-user access
- ✅ **Rate limiting** on API endpoints
- ✅ **Input validation** and sanitization

---

## Testing Migration

1. **Keep PHASE 1 code as fallback** during migration
2. **Use feature flags** to toggle between modes:
   ```javascript
   const MULTI_USER_MODE = process.env.MULTI_USER_ENABLED === 'true';
   ```
3. **Test with demo user** before rolling out to production

---

## No-Code-Change Migration Path

The credential abstraction layer ensures you can migrate **without changing** the rest of your application:

**What stays the same:**
- ✅ All MQTT pub/sub logic
- ✅ UI components and interactions
- ✅ Timer and program scheduling
- ✅ State management

**What changes (1 function):**
- 🔄 `getMQTTCredentials()` implementation only

This is the power of abstraction! 🎉

---

## Questions?

See:
- [README.md](README.md) - Full project documentation
- [WIFI_PROVISIONING.md](WIFI_PROVISIONING.md) - BLE provisioning details
- `docs/js/app.js` - Current implementation with PHASE 1/2 comments
