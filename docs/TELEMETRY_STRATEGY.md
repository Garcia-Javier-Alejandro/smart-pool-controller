# Telemetry Data Migration Strategy

> Status: Current implementation uses D1 with rate limiting optimizations. Migration paths below are for future scalability if needed.

## Current Implementation

The `/api/event` and `/api/history` endpoints use D1 database to store telemetry data (pump state changes, valve states, etc.) with smart rate limiting:
- Events only recorded on actual state changes (not continuous polling)
- 60-day retention with automatic cleanup
- Multi-user isolation via deviceId

**Current approach works well for typical usage.** Consider migration only if scaling to many concurrent users.

## Future Optimization Options

### Option 1: Keep D1 for Low-Frequency Events (Recommended for MVP)

**Approach:** Continue using D1 but enforce rate limiting and aggregation
- Limit event writes to significant state changes only (not continuous polling)
- Device reports only when state actually changes
- Frontend polls current state from MQTT (real-time) not from DB
- DB history used only for charts/analytics

**Pros:**
- Minimal code changes
- Works within Cloudflare free tier
- Simple to maintain

**Cons:**
- May hit D1 limits with many active users
- Not suitable for high-resolution time-series data

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
- Best for high-frequency, high-resolution data
- Powerful querying and aggregation

**Cons:**
- Additional infrastructure cost
- More complex deployment

## Recommendation

**Current implementation (already optimized):**

1. **Device-side:** Only sends events on state changes (not periodic polling)
2. **API-side:** Smart rate limiting with periodic cleanup
3. **Frontend:** Real-time state from MQTT, DB only for history charts
4. **Cleanup:** Retains only 60 days of raw events (automatic)

**Future migration path:** Option 2 (Workers KV) if scaling beyond ~100 active devices with high-frequency updates.

## Implementation Details

Current `/api/event` and `/api/history` endpoints:
- Support both API key (development) and JWT (multi-user) authentication
- Validate device_id against user's registered device when using JWT
- Write to D1 `events` table with automatic cleanup
- Monitor D1 usage and migrate to KV if needed

## Multi-User Event Isolation

JWT authentication enforces:
- User can only write events for their registered device_id
- User can only read history for their registered device_id
- API validates device_id ownership via user account

This prevents users from accessing other users' data even if they know the device_id.
