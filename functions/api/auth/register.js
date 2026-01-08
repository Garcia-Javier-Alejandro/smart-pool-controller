/**
 * POST /api/auth/register
 * Register a new user with device_id verification
 */

import {
  json,
  generateUUID,
  hashPassword,
  validateEmail,
  validatePasswordStrength,
  validateDeviceId
} from '../../_shared/auth.js';

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

  const { username, email, password, deviceId } = payload;

  // Validate required fields
  if (!username || !email || !password || !deviceId) {
    return json({ 
      ok: false, 
      error: 'Missing required fields: username, email, password, deviceId' 
    }, 400);
  }

  // Validate username (alphanumeric, 3-50 chars)
  if (!/^[a-zA-Z0-9_-]{3,50}$/.test(username)) {
    return json({ 
      ok: false, 
      error: 'Username must be 3-50 characters (alphanumeric, underscore, hyphen only)' 
    }, 400);
  }

  // Validate email
  if (!validateEmail(email)) {
    return json({ ok: false, error: 'Invalid email format' }, 400);
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return json({ ok: false, error: passwordValidation.error }, 400);
  }

  // Validate device ID format
  if (!validateDeviceId(deviceId)) {
    return json({ 
      ok: false, 
      error: 'Invalid device ID format. Expected: ESP-XXXXXX (6 hexadecimal characters)' 
    }, 400);
  }

  try {
    // Check if username already exists
    const existingUser = await env.DB
      .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
      .bind(username, email)
      .first();

    if (existingUser) {
      return json({ ok: false, error: 'Username or email already registered' }, 409);
    }

    // Check if device_id is already claimed
    const existingDevice = await env.DB
      .prepare('SELECT id FROM users WHERE device_id = ?')
      .bind(deviceId)
      .first();

    if (existingDevice) {
      return json({ 
        ok: false, 
        error: 'Device ID already registered. Each device can only be linked to one account.' 
      }, 409);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate user ID
    const userId = generateUUID();

    // Insert new user
    await env.DB
      .prepare('INSERT INTO users (id, username, email, password_hash, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, username, email, passwordHash, deviceId.toUpperCase(), Date.now())
      .run();

    // Create device entry
    const deviceDbId = generateUUID();
    const topicPrefix = `devices/${deviceId.toLowerCase()}`;
    
    await env.DB
      .prepare('INSERT INTO devices (id, device_id, user_id, device_name, topic_prefix, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        deviceDbId,
        deviceId.toUpperCase(),
        userId,
        `${username}'s Pool Controller`,
        topicPrefix,
        'provisioning',
        Date.now()
      )
      .run();

    return json({
      ok: true,
      message: 'Registration successful',
      userId,
      deviceId: deviceId.toUpperCase(),
      username
    }, 201);

  } catch (error) {
    console.error('Registration error:', error);
    return json({ 
      ok: false, 
      error: 'Internal server error during registration' 
    }, 500);
  }
}
