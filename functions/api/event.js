/**
 * Event API — POST /api/event
 *
 * Inserts a new ON/OFF event for a device. Supports multi-user auth
 * via user JWT or `x-api-key`.
 *
 * Expected JSON payload:
 * { deviceId?: string, state: "ON"|"OFF", ts?: number(epoch ms), valveId?: 1|2 }
 * - When using JWT, `deviceId` is ignored and taken from the auth context.
 * - `ts` is optional; defaults to `Date.now()`.
 * - `valveId` defaults to 1 if not provided.
 *
 * Response shape:
 * { ok: true, inserted: { deviceId, ts, state, valveId }, meta: { success } }
 *
 * Storage: Uses Cloudflare D1 via `env.DB`.
 * Example curl:
 * curl -X POST /api/event -H "Content-Type: application/json" -d '{"state":"ON","valveId":1}'
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

// Normalize state string to "ON"/"OFF" or null if invalid
function normalizeState(state) {
  const s = String(state || "").toUpperCase().trim();
  if (s === "ON" || s === "OFF") return s;
  return null;
}

export async function onRequest({ request, env }) {
  // Handle CORS preflight for browsers
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
      }
    });
  }

  // Only POST is supported to insert events
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed. Use POST." }, 405);
  }

  // Multi-user authentication (JWT or API Key)
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  // Parse JSON body safely
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  // Resolve deviceId depending on auth type
  let deviceId;
  if (auth.authType === 'jwt') {
    // JWT auth: enforce user's registered device_id
    deviceId = auth.deviceId;
  } else {
    // API key auth (legacy): use deviceId from payload
    deviceId = (payload.deviceId || "esp32-01").toString().trim();
  }

  // Validate and normalize inputs
  const state = normalizeState(payload.state);
  const ts = Number.isFinite(payload.ts) ? Number(payload.ts) : Date.now();
  const valveId = Number.isFinite(payload.valveId) ? Number(payload.valveId) : 1; // Default to valve 1

  if (!deviceId) return json({ ok: false, error: "deviceId is required" }, 400);
  if (!state) return json({ ok: false, error: 'state must be "ON" or "OFF"' }, 400);
  if (!Number.isFinite(ts) || ts <= 0) return json({ ok: false, error: "ts must be a positive number (epoch ms)" }, 400);
  if (valveId !== 1 && valveId !== 2) return json({ ok: false, error: "valveId must be 1 or 2" }, 400);

  try {
    // Insert new event with valve_id into Cloudflare D1
    const stmt = env.DB
      .prepare("INSERT INTO events (device_id, ts, state, valve_id) VALUES (?, ?, ?, ?)")
      .bind(deviceId, ts, state, valveId);

    const result = await stmt.run();

    // Clean up old events to cap DB size
    // Retain only the past 60 days; run occasionally to avoid overhead
    if (Math.random() < 0.1) {
      const retentionMs = 60 * 24 * 60 * 60 * 1000; // 60 days in milliseconds
      const cutoffTs = Date.now() - retentionMs;
      
      await env.DB
        .prepare("DELETE FROM events WHERE ts < ?")
        .bind(cutoffTs)
        .run();
    }

    // Return inserted data and write result meta
    return json({
      ok: true,
      inserted: {
        deviceId,
        ts,
        state,
        valveId,
      },
      meta: {
        success: result.success,
      },
    });
  } catch (e) {
    // DB exceptions are returned with a generic message and detail string
    return json({ ok: false, error: "DB insert failed", detail: String(e) }, 500);
  }
}
