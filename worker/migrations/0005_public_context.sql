-- Public context cache: Solar, Weather and Geocoded Place Labels
-- Avoid repeated external queries; keyed compactly
-- Leased execution prevents concurrent external request thundering herd
-- Rate-limiting table preserves 1 req/s compliance across Workers for Nominatim

CREATE TABLE IF NOT EXISTS public_context_cache (
    kind TEXT NOT NULL CHECK (kind IN ('sun', 'weather', 'place')),
    cache_key TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER, -- NULL means permanent (e.g. sun, historical weather, place label)
    PRIMARY KEY (kind, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_public_context_expires
ON public_context_cache (expires_at)
WHERE expires_at IS NOT NULL;

-- Lightweight leases per cache key to prevent dogpiling on third-party APIs
CREATE TABLE IF NOT EXISTS public_context_leases (
    kind TEXT NOT NULL CHECK (kind IN ('sun', 'weather', 'place')),
    cache_key TEXT NOT NULL,
    lease_token TEXT NOT NULL,
    leased_until INTEGER NOT NULL,
    PRIMARY KEY (kind, cache_key)
);

-- Global rate-limiting marker for third-party services requiring strict spacing (e.g. Nominatim 1 req/s)
CREATE TABLE IF NOT EXISTS public_context_ratelimit (
    service TEXT PRIMARY KEY,
    next_allowed_at INTEGER NOT NULL
);
