/**
 * Utility Functions for Authentication
 * Cloudflare Pages Functions / Workers compatible
 */

// ============================================
// Response Helpers
// ============================================

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization"
    },
  });
}

export function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization"
  };
}

// ============================================
// UUID Generation (v4)
// ============================================

export function generateUUID() {
  return crypto.randomUUID();
}

// ============================================
// Password Hashing (using Web Crypto API)
// ============================================

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password) {
  // Simple SHA-256 for now. For production, use bcrypt or Argon2 via WASM
  // Note: This is NOT secure for production - just a placeholder
  // TODO: Implement proper password hashing with salt
  const salt = generateRandomString(16);
  const hash = await sha256(salt + password);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const computedHash = await sha256(salt + password);
  return computedHash === hash;
}

// ============================================
// JWT Token Generation & Verification
// ============================================

async function base64UrlEncode(data) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function hmacSha256(secret, message) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return signature;
}

export async function generateJWT(payload, secret, expiresInSeconds = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  
  const jwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = await base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = await base64UrlEncode(new TextEncoder().encode(JSON.stringify(jwtPayload)));
  const message = `${encodedHeader}.${encodedPayload}`;
  
  const signature = await hmacSha256(secret, message);
  const encodedSignature = await base64UrlEncode(signature);
  
  return `${message}.${encodedSignature}`;
}

export async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const message = `${encodedHeader}.${encodedPayload}`;
    
    // Verify signature
    const expectedSignature = await hmacSha256(secret, message);
    const expectedEncodedSignature = await base64UrlEncode(expectedSignature);
    
    if (encodedSignature !== expectedEncodedSignature) return null;

    // Decode payload
    const payloadJson = atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

// ============================================
// Authorization Header Parsing
// ============================================

export function getBearerToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

export async function requireAuth(request, env) {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized: Missing token' };
  }

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) {
    return { ok: false, status: 401, error: 'Unauthorized: Invalid or expired token' };
  }

  // Check if session exists in database
  const tokenHash = await sha256(token);
  const session = await env.DB
    .prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(tokenHash, Date.now())
    .first();

  if (!session) {
    return { ok: false, status: 401, error: 'Unauthorized: Session expired or invalid' };
  }

  return { ok: true, userId: payload.userId, username: payload.username };
}

// ============================================
// Random String Generation
// ============================================

export function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

export function generateSecurePassword(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

// ============================================
// Device ID Validation
// ============================================

export function validateDeviceId(deviceId) {
  // Format: ESP-XXXXXX (where XXXXXX is last 6 hex chars of MAC)
  const pattern = /^ESP-[A-Fa-f0-9]{6}$/;
  return pattern.test(deviceId);
}

// ============================================
// Email Validation
// ============================================

export function validateEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// ============================================
// Password Strength Validation
// ============================================

export function validatePasswordStrength(password) {
  // Minimum 8 characters, must contain uppercase, lowercase, number, and special char
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  return { valid: true };
}
