-- Schema for Life.ai AI settings and day summaries
-- Single-owner settings and cached summaries keyed by local date and canonical timezone

CREATE TABLE IF NOT EXISTS ai_settings (
    id TEXT PRIMARY KEY CHECK(id = 'default'),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    base_url TEXT NOT NULL DEFAULT '',
    sdk_type TEXT NOT NULL CHECK(sdk_type IN ('openai', 'anthropic')),
    auth_type TEXT NOT NULL CHECK(auth_type IN ('apiKey', 'bearer')),
    encrypted_api_key TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS day_summaries (
    date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    content TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    event_count INTEGER NOT NULL,
    generated_at INTEGER NOT NULL,
    PRIMARY KEY (date, timezone)
);

CREATE TABLE IF NOT EXISTS day_summary_leases (
    date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    lease_token TEXT NOT NULL,
    leased_until INTEGER NOT NULL,
    PRIMARY KEY (date, timezone)
);
