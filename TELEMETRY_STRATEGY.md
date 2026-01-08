# Telemetry Data Migration Strategy

## Current State (Phase 1)

The existing `/api/event` and `/api/history` endpoints use D1 database to store high-frequency telemetry data (pump state changes, valve states, etc.).

**Problem:** D1 is optimized for low-write, high-read data. High-frequency telemetry writes can hit rate limits.

## Phase 2 Strategy

### Option 1: Keep D1 for Low-Frequency Events (Recommended for MVP)

**Approach:** Continue using D1 but enforce rate limiting and aggregation
- Limit event writes to significant state changes only (not continuous polling)
- Device reports only when state actually changes
- Frontend polls current state from MQTT (real-time) not from DB
- DB history used only for charts/analytics

**Pros:**
- ✅ Minimal code changes
- ✅ Works within Cloudflare free tier
- ✅ Simple to maintain

**Cons:**
- ⚠️ May hit D1 limits with many active users
- ⚠️ Not suitable for high-resolution time-series data

### Option 2: Migrate to Cloudflare Workers KV (Future)

**Approach:** Use KV for recent telemetry, D1 for aggregated history
- Recent 24h data → Workers KV (fast, high-write capable)
- Older data → D1 (aggregated hourly/daily summaries)

**Migration Path:**
1. Create KV namespace for events
2. Update `/api/event` to write to KV
3. Background worker aggregates KV → D1 hourly
4. Update `/api/history` to read from KV (recent) + D1 (historical)

### Option 3: Migrate to Cloudflare Durable Objects (Advanced)

**Approach:** One Durable Object per device
- Each device has its own DO for state management
- DO maintains in-memory state + SQLite storage
- Periodic snapshots to D1 for long-term history

**Use Case:** Real-time device control with WebSocket support

### Option 4: External Time-Series Database

**Approach:** Use InfluxDB, TimescaleDB, or similar
- High-write telemetry → External DB
- User/auth data → D1
- Cloudflare Worker proxies requests

**Pros:**
- ✅ Best for high-frequency, high-resolution data
- ✅ Powerful querying and aggregation

**Cons:**
- ⚠️ Additional infrastructure cost
- ⚠️ More complex deployment

## Recommendation for Phase 2

**Start with Option 1** - keep using D1 but optimize:

1. **Device-side:** Only send events on state changes (not periodic polling)
2. **API-side:** Implement rate limiting per device (max 1 write/second)
3. **Frontend:** Get real-time state from MQTT, use DB only for history charts
4. **Cleanup:** Retain only 60 days of raw events (already implemented)

**Future migration path:** Option 2 (Workers KV) when scaling beyond ~100 active devices.

## Implementation Notes

For now, the existing `/api/event` and `/api/history` endpoints will:
- Support both API key (legacy) and JWT (multi-tenant) authentication
- Validate device_id against user's registered device when using JWT
- Continue writing to D1 `events` table
- Monitor D1 usage and migrate to KV if needed

## Multi-Tenant Event Isolation

When using JWT authentication:
- User can only write events for their registered device_id
- User can only read history for their registered device_id
- API validates device_id matches user's account

This prevents users from accessing other users' data even if they know the device_id.
