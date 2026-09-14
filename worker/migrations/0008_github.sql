-- Preserve existing encrypted source credentials while extending the provider constraint.
CREATE TABLE day_source_settings_next (
    provider TEXT PRIMARY KEY CHECK (provider IN ('gecko', 'firefly', 'github')),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    encrypted_api_key TEXT,
    updated_at INTEGER NOT NULL,
    account_id INTEGER,
    account_login TEXT
);
INSERT INTO day_source_settings_next (provider, enabled, encrypted_api_key, updated_at)
SELECT provider, enabled, encrypted_api_key, updated_at FROM day_source_settings;
DROP TABLE day_source_settings;
ALTER TABLE day_source_settings_next RENAME TO day_source_settings;

-- Complete snapshots, including empty days, survive PAT rotation and settings toggles.
-- The same row also coordinates concurrent first reads across Worker instances.
CREATE TABLE github_day_cache (
    account_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    data_json TEXT CHECK (data_json IS NULL OR json_valid(data_json)),
    fetched_at INTEGER,
    lease_token TEXT,
    leased_until INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, date, timezone, start_at, end_at)
);
