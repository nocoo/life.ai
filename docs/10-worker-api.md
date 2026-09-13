# Worker Backend Architecture & API Specification

This document details the backend implementation, database schema, authentication invariants, and API endpoints for the Cloudflare Worker in `life.ai`.

---

## 1. Responsibilities and Boundary Isolation

- **Runtime**: Cloudflare Worker running natively on the V8 engine, backed by Cloudflare D1 (`life`).
- **Domain Routing & Host Isolation**:
  - `APP_ORIGIN` (`https://life.hexly.ai`): Dashboard SPA and authenticated API routes (`/api/session`, `/api/sources`, `/api/events`, `/api/imports`, `/api/connects`).
  - `INGEST_HOST` (`life.worker.hexly.ai`): Machine ingestion endpoint (`POST /api/ingest`) and health probe (`GET /api/live`). Disallows static assets, SPA dashboard, or any data reads.
  - Development (`life.dev.hexly.ai` or loopback `127.0.0.1` / `localhost` / `::1`): Development routing with local identity bypass under strict `RESOURCE_ENV === "development"`.
  - All foreign hostnames are blocked in production with `403 forbidden_host`.
  - Unknown `/api/*` requests return a JSON `404 not_found` response to avoid falling through to the SPA HTML asset handler.

---

## 2. Authentication and Security Model

### 2.1 Cloudflare Access JWT Authentication

- Verifies signed RS256 JWTs provided via `Cf-Access-Jwt-Assertion`.
- JWKS is fetched from `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` and cached.
- JWT verification enforces:
  - Algorithm strictly `["RS256"]`.
  - Issuer matching `https://${ACCESS_TEAM_DOMAIN}`.
  - Audience matching configured `ACCESS_AUD`.
  - Mandatory claims `exp` and `sub`.
- Verification errors are completely sanitized: raw `jose` exceptions are never exposed to clients.
- Production never bypasses authentication via spoofed headers or host manipulation.

### 2.2 Physical Test Isolation & Bypass Invariants

To guarantee that test shortcuts cannot accidentally or maliciously activate in production:
1. `RESOURCE_ENV === "test"`.
2. Hostname strictly constrained to loopback (`127.0.0.1`, `localhost`, `::1`).
3. **Physical DB Verification**: The database MUST contain the table `_test_marker` (schema: `key TEXT PRIMARY KEY, value TEXT`) with row `key = 'env'` and `value = 'test'`. If missing or throwing, bypass is rejected immediately and falls back to standard Access verification.
4. Both the local test identity shortcut and local fixture JWKS (`TEST_ACCESS_JWKS`) require the database test marker verification.

### 2.3 Connect Tokens (Machine Ingest)

- Write-only bearer tokens with exact format `^life_[0-9a-fA-F]{64}$` (generated from 32 cryptographically secure random bytes).
- Plaintext token is shown **only once** upon creation (`POST /api/connects`).
- At rest, tokens are stored as **SHA-256** digests (`token_hash`).
- Revocation sets `revoked_at` timestamp.
- **Race Condition Prevention**: At ingestion time, the query uses an atomic single-statement insert with revocation fencing:
  ```sql
  INSERT INTO life_events (...)
  SELECT ?, id, NULL, ?, NULL, 'hour', ?, ?, ?, ?
  FROM connects
  WHERE id = ? AND revoked_at IS NULL
  ON CONFLICT(source_id, occurred_at) WHERE external_key IS NULL DO UPDATE ...
  RETURNING id, occurred_at, precision, updated_at
  ```
  If the token was concurrently revoked, 0 rows are selected and `row` is `null`, returning `403 token_revoked`.
- `last_used_at` is only updated upon successful writes, preventing timestamp inflation from rejected or revoked requests.

### 2.4 Browser CSRF, Media Type, & Origin Defense

- Every API endpoint receiving a JSON body enforces `Content-Type: application/json` (allowing optional charset parameter). Non-matching media types return `415 unsupported_media_type`.
- Top-level non-object payloads (e.g. primitives, arrays, booleans) are strictly rejected with `400 invalid_payload`.
- For state-modifying requests (`POST`, `PUT`, `PATCH`, `DELETE`) on the browser app host:
  - Validates full `Origin` (including scheme) against `APP_ORIGIN` and request origin.
  - For requests missing `Origin`, checks `Sec-Fetch-Site`: rejects anything except `same-origin` or `none`.

---

## 3. Database Schema (`life` D1)

Applied via migration `worker/migrations/0001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('import', 'connect')),
    provider TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_connects_token_hash ON connects(token_hash);

CREATE TABLE IF NOT EXISTS life_events (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id),
    external_key TEXT,
    occurred_at INTEGER NOT NULL,
    end_at INTEGER,
    precision TEXT NOT NULL CHECK(precision IN ('day', 'hour', 'minute', 'second')),
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
);

-- Unique constraint for import sources: (source_id, external_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_life_events_import_unique
ON life_events(source_id, external_key)
WHERE external_key IS NOT NULL;

-- Unique constraint for connect sources: (source_id, occurred_at) where external_key is NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_life_events_connect_unique
ON life_events(source_id, occurred_at)
WHERE external_key IS NULL;

-- Query index for time window and source filtering
CREATE INDEX IF NOT EXISTS idx_life_events_range
ON life_events(occurred_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_life_events_source_range
ON life_events(source_id, occurred_at ASC, id ASC);
```

---

## 4. API Endpoints

### 4.1 `GET /api/live`
- Public health check:
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "timestamp": "2026-09-13T17:35:00.000Z",
    "database": "ok"
  }
  ```
- Queries `SELECT 1 as alive`. If DB query fails or does not return `alive === 1`, returns `503 Service Unavailable` with `database: "error"`.

### 4.2 `GET /api/session`
- Authenticated via Cloudflare Access.
- Response:
  ```json
  {
    "data": {
      "email": "user@hexly.ai",
      "subject": "sub-12345",
      "mode": "access"
    }
  }
  ```

### 4.3 `GET /api/sources`
- Lists import and Connect sources with aggregated counts and `lastEventAt` (using `!= null` check so timestamp `0` is preserved). Revoked Connects remain available as historical sources.

### 4.4 `GET /api/events?start=ISO&end=ISO&source=ID&cursor=STRING`
- Half-open UTC window `[start, end)`.
- Validates window width $\le 32$ days.
- In-window occurrence condition includes point events and zero-length intervals at window start (`occurred_at >= start AND occurred_at < end`), plus non-day interval events overlapping the window (`precision != 'day' AND end_at > occurred_at AND occurred_at < end AND end_at > start`).
- Paginated with page size 200 using opaque base64url cursor `base64url(occurredAtMs:id)`.

### 4.5 `POST /api/imports`
- Accepts batch of 1 to 100 records for built-in sources (`apple-health`, `footprint`, `pixiu`, `journal`).
- Validates that records array contains only valid objects.
- Precision defaults to `'hour'` only if `undefined`; explicit invalid values return `400 invalid_precision`.
- Normalized and floored via shared `timestampAtPrecision`.
- Validates that `endAt >= occurredAt`; day records have `endAt` forced to `null` to avoid spanning other days.
- `ensureImportSource` executes only after all record validations succeed.

### 4.6 `GET /api/connects`
- Lists Connect metadata (`id`, `name`, `prefix`, `createdAt`, `lastUsedAt`, `revokedAt`, `recordCount`). Plaintext token is never returned.

### 4.7 `POST /api/connects`
- Body: `{ "name": "Apple Watch" }`.
- Returns `{ "data": { "connect": Connect, "token": "life_..." } }` with HTTP 201 Created.

### 4.8 `DELETE /api/connects/:id`
- Revokes Connect token idempotently while retaining historical event records.

### 4.9 `POST /api/ingest`
- Authenticated via `Authorization: Bearer <connect-token>`.
- Other methods return 405 on the app host before token authentication; the machine hostname's strict route allowlist returns 404 for those methods.
- Body: `{ "timestamp": "...", "title": "...", "content": "...", "data": {...} }`.
- Floors timestamp to UTC hour boundary.
- Atomic UPSERT on `(source_id, occurred_at)`: preserves record `id`, updates `title`, `content`, `data`, `updated_at`.
- Returns `{ "data": { "id", "occurredAt", "precision": "hour", "updatedAt" } }`.

---

## 5. Input Boundaries & Payload Limits

| Item | Limit |
| --- | --- |
| Max Request Body | 1 MiB (stream-capped) |
| Max Event Data (`data`) | 32 KiB JSON |
| Max Event Title | 200 characters |
| Max Event Content | 8,000 characters |
| Max Connect Name | 80 characters |
| Max Events Range Window | 32 days |
| Events Page Size | 200 records |
| Max Import Batch Size | 100 records |
