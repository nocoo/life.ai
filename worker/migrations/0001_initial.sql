-- Schema for Life.ai chronicle rewrite
-- Tables: sources, connects, life_events

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
