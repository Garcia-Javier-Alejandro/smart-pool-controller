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

  const { email, password, deviceId } = payload;

  // Validate required fields
  if (!email || !password || !deviceId) {
    return json({ 
      ok: false, 
      error: 'Missing required fields: email, password, deviceId' 
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
    // Check if email already exists
    const existingUser = await env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existingUser) {
      return json({ ok: false, error: 'Email already registered' }, 409);
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
      .prepare('INSERT INTO users (id, email, password_hash, device_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, email, passwordHash, deviceId.toUpperCase(), Date.now())
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
        `Pool Controller`,
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
      email
    }, 201);

  } catch (error) {
    console.error('Registration error:', error);
    return json({ 
      ok: false, 
      error: 'Internal server error during registration' 
    }, 500);
  }
}
