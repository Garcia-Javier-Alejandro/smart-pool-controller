/**
 * POST /api/auth/logout
 * Invalidate JWT token session
 */

import {
  json,
  requireAuth
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method Not Allowed. Use POST.' }, 405);
  }

  // Verify authentication
  const auth = await requireAuth(request, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  try {
    // Get token from header
    const authHeader = request.headers.get('Authorization');
    const token = authHeader.substring(7); // Remove 'Bearer '
    const tokenHash = await sha256(token);

    // Delete session from database
    await env.DB
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .run();

    return json({
      ok: true,
      message: 'Logged out successfully'
    }, 200);

  } catch (error) {
    console.error('Logout error:', error);
    return json({ 
      ok: false, 
      error: 'Internal server error during logout' 
    }, 500);
  }
}
