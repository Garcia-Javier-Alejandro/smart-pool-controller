/**
 * Multi-tenant aware authentication helper
 * Supports both JWT (multi-tenant) and API Key (legacy) authentication
 */

import { requireAuth } from './auth.js';

/**
 * Authenticate request and return user/device context
 * Returns: { ok: boolean, userId?: string, deviceId?: string, error?: string, status?: number }
 */
export async function authenticateRequest(request, env) {
  // Check for Bearer token (multi-tenant JWT)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const auth = await requireAuth(request, env);
    if (!auth.ok) {
      return auth;
    }
    
    // Get user's device_id from database
    const user = await env.DB
      .prepare('SELECT device_id FROM users WHERE id = ?')
      .bind(auth.userId)
      .first();
    
    if (!user) {
      return { ok: false, status: 404, error: 'User not found' };
    }
    
    return {
      ok: true,
      userId: auth.userId,
      deviceId: user.device_id,
      authType: 'jwt'
    };
  }
  
  // Check for API Key (legacy single-tenant)
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    if (!env.API_KEY) {
      return { ok: false, status: 500, error: 'API_KEY not configured' };
    }
    if (apiKey !== env.API_KEY) {
      return { ok: false, status: 401, error: 'Invalid API key' };
    }
    
    // Legacy mode: no user context, deviceId from payload
    return {
      ok: true,
      userId: null,
      deviceId: null, // Will be taken from payload
      authType: 'api_key'
    };
  }
  
  return { ok: false, status: 401, error: 'Missing authentication (Bearer token or x-api-key)' };
}
