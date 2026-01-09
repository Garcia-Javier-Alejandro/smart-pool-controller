/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */

import {
  json,
  generateUUID,
  verifyPassword,
  generateJWT
} from '../../_shared/auth.js';

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method Not Allowed. Use POST.' }, 405);
  }

  // Parse request body
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { email, password } = payload;

  // Validate required fields
  if (!email || !password) {
    return json({ 
      ok: false, 
      error: 'Missing required fields: email, password' 
    }, 400);
  }

  try {
    // Find user by email
    const user = await env.DB
      .prepare('SELECT id, email, password_hash, device_id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (!user) {
      return json({ ok: false, error: 'Invalid email or password' }, 401);
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return json({ ok: false, error: 'Invalid email or password' }, 401);
    }

    // Generate JWT token
    const expiresInSeconds = 24 * 60 * 60; // 24 hours
    const token = await generateJWT(
      {
        userId: user.id,
        email: user.email,
        deviceId: user.device_id
      },
      env.JWT_SECRET,
      expiresInSeconds
    );

    // Store session in database
    const sessionId = generateUUID();
    const tokenHash = await sha256(token);
    const expiresAt = Date.now() + (expiresInSeconds * 1000);

    await env.DB
      .prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(sessionId, user.id, tokenHash, expiresAt, Date.now())
      .run();

    // Update last_login timestamp
    await env.DB
      .prepare('UPDATE users SET last_login = ? WHERE id = ?')
      .bind(Date.now(), user.id)
      .run();

    return json({
      ok: true,
      token,
      expiresIn: expiresInSeconds,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        deviceId: user.device_id
      }
    }, 200);

  } catch (error) {
    console.error('Login error:', error);
    return json({ 
      ok: false, 
      error: 'Internal server error during login' 
    }, 500);
  }
}
