CREATE TABLE IF NOT EXISTS day_source_settings (
    provider TEXT PRIMARY KEY CHECK (provider IN ('gecko', 'firefly')),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    encrypted_api_key TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS day_source_cache (
    provider TEXT NOT NULL,
    date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    source_version INTEGER NOT NULL,
    data_json TEXT NOT NULL CHECK (json_valid(data_json)),
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (provider, date, timezone, start_at, end_at)
);
