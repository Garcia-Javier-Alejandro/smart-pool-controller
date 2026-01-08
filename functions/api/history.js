import { authenticateRequest } from '../_shared/multitenantAuth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    },
  });
}

function parseRangeToMs(rangeStr) {
  // Acepta: "24h", "7d", "60m", "all"
  const raw = (rangeStr || "24h").toString().trim().toLowerCase();
  
  // Special case: "all" means all time (use a very old timestamp)
  if (raw === "all") {
    return 365 * 24 * 60 * 60 * 1000; // 1 year back
  }
  
  const m = raw.match(/^(\d+)\s*([mhd])$/);
  if (!m) return 24 * 60 * 60 * 1000;

  const n = parseInt(m[1], 10);
  const unit = m[2];

  const mult =
    unit === "m" ? 60 * 1000 :
    unit === "h" ? 60 * 60 * 1000 :
    24 * 60 * 60 * 1000;

  // límites razonables para evitar abusos: 1m a 30d
  const ms = n * mult;
  const min = 60 * 1000;
  const max = 30 * 24 * 60 * 60 * 1000;
  return Math.max(min, Math.min(max, ms));
}

export async function onRequest({ request, env }) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
      }
    });
  }

  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed. Use GET." }, 405);
  }

  // Multi-tenant authentication (JWT or API Key)
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const url = new URL(request.url);
  
  // Multi-tenant: Use authenticated device_id for JWT auth, or query param for API key
  let deviceId;
  if (auth.authType === 'jwt') {
    // JWT auth: enforce user's registered device_id
    deviceId = auth.deviceId;
  } else {
    // API key auth (legacy): use deviceId from query param
    deviceId = (url.searchParams.get("deviceId") || "esp32-01").toString().trim();
  }

  const range = (url.searchParams.get("range") || "24h").toString().trim();
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") || "200", 10)));

  const rangeMs = parseRangeToMs(range);
  const sinceTs = Date.now() - rangeMs;

  try {
    const stmt = env.DB
      .prepare(
        "SELECT ts, state, valve_id FROM events WHERE device_id = ? AND ts >= ? ORDER BY ts ASC LIMIT ?"
      )
      .bind(deviceId, sinceTs, limit);

    const rows = await stmt.all();

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
    return json({ ok: false, error: "DB query failed", detail: String(e) }, 500);
  }
}
