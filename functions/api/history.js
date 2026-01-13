/**
 * History API — GET /api/history
 *
 * Returns a list of ON/OFF events for a device within a time range.
 * Works with multi-user auth: either a user JWT or an `x-api-key`.
 *
 * Query parameters:
 * - deviceId: optional; used only when authenticating via API key (legacy).
 * - range: string like "1h", "24h", "7d", "60m", or "all" (caps to 30d).
 * - limit: maximum number of rows returned (1–500). Defaults to 200.
 *
 * Response shape:
 * { ok: true, deviceId, range, sinceTs, count, items: [{ ts, state, valve_id }] }
 *
 * Storage: Uses Cloudflare D1 via `env.DB`.
 * Example: fetch('/api/history?deviceId=esp32-01&range=24h&limit=200')
 */
import { authenticateRequest } from '../_shared/multiUserAuth.js';

// Helper to build JSON responses with CORS
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    },
  });
}

// Convert a human-friendly range string to milliseconds
function parseRangeToMs(rangeStr) {
  // Acepta: "24h", "7d", "60m", "all"
  const raw = (rangeStr || "24h").toString().trim().toLowerCase();
  
  // Special case: "all" means all time (use a very old timestamp)
  // We pick 1 year as a practical upper bound to avoid massive scans
  if (raw === "all") {
    return 365 * 24 * 60 * 60 * 1000; // 1 year back
  }
  
  const m = raw.match(/^(\d+)\s*([mhd])$/);
  if (!m) return 24 * 60 * 60 * 1000; // default 24h

  const n = parseInt(m[1], 10);
  const unit = m[2];

  const mult =
    unit === "m" ? 60 * 1000 :
    unit === "h" ? 60 * 60 * 1000 :
    24 * 60 * 60 * 1000; // "d"

  // límites razonables para evitar abusos: 1m a 30d
  const ms = n * mult;
  const min = 60 * 1000;
  const max = 30 * 24 * 60 * 60 * 1000;
  return Math.max(min, Math.min(max, ms));
}

export async function onRequest({ request, env }) {
  // Handle CORS preflight for browsers
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
      }
    });
  }

  // Only GET is supported for history retrieval
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed. Use GET." }, 405);
  }

  // Multi-user authentication (JWT or API Key)
  // - JWT: deviceId is taken from the authenticated user context
  // - API key (legacy/development): deviceId can be provided via query string
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const url = new URL(request.url);
  
  // Resolve deviceId depending on auth type
  let deviceId;
  if (auth.authType === 'jwt') {
    // JWT auth: enforce user's registered device_id
    deviceId = auth.deviceId;
  } else {
    // API key auth (legacy): use deviceId from query param
    deviceId = (url.searchParams.get("deviceId") || "esp32-01").toString().trim();
  }

  // Parse range and limit with safe bounds
  const range = (url.searchParams.get("range") || "24h").toString().trim();
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") || "200", 10)));

  const rangeMs = parseRangeToMs(range);
  const sinceTs = Date.now() - rangeMs;

  try {
    // Query Cloudflare D1 for events for this device starting at sinceTs
    const stmt = env.DB
      .prepare(
        "SELECT ts, state, valve_id FROM events WHERE device_id = ? AND ts >= ? ORDER BY ts ASC LIMIT ?"
      )
      .bind(deviceId, sinceTs, limit);

    const rows = await stmt.all();

    // Return normalized items (default valve_id=1 for older records)
    return json({
      ok: true,
      deviceId,
      range,
      sinceTs,
      count: rows.results?.length || 0,
      items: (rows.results || []).map(r => ({ 
        ts: r.ts, 
        state: r.state,
        valve_id: r.valve_id || 1 // Default to 1 for old records
      })),
    });
  } catch (e) {
    // DB exceptions are returned with a generic message and detail string
    return json({ ok: false, error: "DB query failed", detail: String(e) }, 500);
  }
}
