/**
 * GET /api/auth/mqtt-credentials
 * Return MQTT credentials for authenticated user
 */

import {
  json,
  requireAuth,
  generateSecurePassword,
  hashPassword
} from '../../_shared/auth.js';

export async function onRequest({ request, env }) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Method Not Allowed. Use GET.' }, 405);
  }

  // Verify authentication
  const auth = await requireAuth(request, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  try {
    // Get user details
    const user = await env.DB
      .prepare('SELECT id, username, device_id FROM users WHERE id = ?')
      .bind(auth.userId)
      .first();

    if (!user) {
      return json({ ok: false, error: 'User not found' }, 404);
    }

    // Check if user already has MQTT credentials
    let credentials = await env.DB
      .prepare('SELECT mqtt_user, mqtt_pass_hash FROM mqtt_credentials WHERE user_id = ?')
      .bind(user.id)
      .first();

    let mqttPassword = null;

    if (!credentials) {
      // Generate new MQTT credentials
      const mqttUser = `mqtt_${user.username}_${user.device_id}`.toLowerCase();
      mqttPassword = generateSecurePassword(32);
      const mqttPassHash = await hashPassword(mqttPassword);

      // Store in database
      await env.DB
        .prepare('INSERT INTO mqtt_credentials (user_id, mqtt_user, mqtt_pass_hash, created_at) VALUES (?, ?, ?, ?)')
        .bind(user.id, mqttUser, mqttPassHash, Date.now())
        .run();

      credentials = {
        mqtt_user: mqttUser,
        mqtt_pass_hash: mqttPassHash
      };

      // TODO: Create MQTT user in HiveMQ Cloud via API
      // await createHiveMQUser(mqttUser, mqttPassword, `devices/${user.device_id.toLowerCase()}/#`, env);
    }

    // Get device details
    const device = await env.DB
      .prepare('SELECT device_id, topic_prefix FROM devices WHERE user_id = ?')
      .bind(user.id)
      .first();

    const topicPrefix = device ? device.topic_prefix : `devices/${user.device_id.toLowerCase()}`;

    return json({
      ok: true,
      mqttUser: credentials.mqtt_user,
      mqttPassword: mqttPassword, // Only returned on first generation
      topicPrefix,
      brokerUrl: env.MQTT_BROKER_URL || 'wss://broker.hivemq.cloud:8884/mqtt',
      message: mqttPassword 
        ? 'New MQTT credentials generated. Save the password - it cannot be retrieved again.' 
        : 'Existing MQTT credentials returned. Password is not available for security reasons.'
    }, 200);

  } catch (error) {
    console.error('MQTT credentials error:', error);
    return json({ 
      ok: false, 
      error: 'Internal server error retrieving MQTT credentials' 
    }, 500);
  }
}

// TODO: Implement HiveMQ Cloud API integration
async function createHiveMQUser(mqttUser, mqttPassword, topicPattern, env) {
  // This would call HiveMQ Cloud API to create user with ACL restrictions
  // Example:
  // const response = await fetch('https://api.hivemq.cloud/v1/users', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${env.HIVEMQ_API_TOKEN}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     username: mqttUser,
  //     password: mqttPassword,
  //     permissions: [{
  //       topic: topicPattern,
  //       allow: { publish: true, subscribe: true }
  //     }]
  //   })
  // });
  // return response.json();
}
