-- Compact provider snapshots. All times, including utc_day, are epoch milliseconds.
CREATE TABLE provider_days (
    source_id TEXT NOT NULL REFERENCES sources(id),
    utc_day INTEGER NOT NULL CHECK (utc_day % 86400000 = 0),
    record_count INTEGER NOT NULL CHECK (record_count > 0),
    first_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    payload_bytes INTEGER NOT NULL CHECK (payload_bytes > 0),
    summary_json TEXT NOT NULL,
    data_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (source_id, utc_day)
);

-- Small totals keep the source picker independent of historical dataset size.
-- The larger coverage snapshot is recalculated only after a content revision.
CREATE TABLE provider_state (
    source_id TEXT PRIMARY KEY REFERENCES sources(id),
    revision INTEGER NOT NULL DEFAULT 0,
    record_count INTEGER NOT NULL DEFAULT 0,
    data_rows INTEGER NOT NULL DEFAULT 0,
    payload_bytes INTEGER NOT NULL DEFAULT 0,
    last_changed_at INTEGER,
    last_imported_at INTEGER,
    last_import_channel TEXT CHECK (last_import_channel IN ('web', 'cli')),
    stats_revision INTEGER NOT NULL DEFAULT -1,
    stats_json TEXT
);

INSERT INTO provider_state (source_id, record_count, data_rows, payload_bytes, last_changed_at)
SELECT s.id, COUNT(e.id), COUNT(e.id), COALESCE(SUM(length(CAST(e.data AS BLOB))), 0), MAX(e.updated_at)
FROM sources s LEFT JOIN life_events e ON e.source_id = s.id GROUP BY s.id;

CREATE TRIGGER source_provider_state AFTER INSERT ON sources BEGIN
    INSERT INTO provider_state (source_id) VALUES (NEW.id);
END;

CREATE TRIGGER event_state_insert AFTER INSERT ON life_events BEGIN
    UPDATE provider_state SET
        revision = revision + 1, record_count = record_count + 1, data_rows = data_rows + 1,
        payload_bytes = payload_bytes + length(CAST(NEW.data AS BLOB)), last_changed_at = NEW.updated_at
    WHERE source_id = NEW.source_id;
END;

CREATE TRIGGER event_state_delete AFTER DELETE ON life_events BEGIN
    UPDATE provider_state SET
        revision = revision + 1, record_count = record_count - 1, data_rows = data_rows - 1,
        payload_bytes = payload_bytes - length(CAST(OLD.data AS BLOB)),
        last_changed_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE source_id = OLD.source_id;
END;

CREATE TRIGGER event_state_update AFTER UPDATE ON life_events
WHEN NEW.source_id IS NOT OLD.source_id OR NEW.occurred_at IS NOT OLD.occurred_at
    OR NEW.end_at IS NOT OLD.end_at OR NEW.precision IS NOT OLD.precision
    OR NEW.title IS NOT OLD.title OR NEW.content IS NOT OLD.content OR NEW.data IS NOT OLD.data
BEGIN
    UPDATE provider_state SET
        revision = revision + 1, record_count = record_count - 1, data_rows = data_rows - 1,
        payload_bytes = payload_bytes - length(CAST(OLD.data AS BLOB)), last_changed_at = NEW.updated_at
    WHERE source_id = OLD.source_id;
    UPDATE provider_state SET
        revision = revision + 1, record_count = record_count + 1, data_rows = data_rows + 1,
        payload_bytes = payload_bytes + length(CAST(NEW.data AS BLOB)), last_changed_at = NEW.updated_at
    WHERE source_id = NEW.source_id;
END;

CREATE TRIGGER day_state_insert AFTER INSERT ON provider_days BEGIN
    UPDATE provider_state SET
        revision = revision + 1, record_count = record_count + NEW.record_count, data_rows = data_rows + 1,
        payload_bytes = payload_bytes + NEW.payload_bytes, last_changed_at = NEW.updated_at
    WHERE source_id = NEW.source_id;
END;

CREATE TRIGGER day_state_delete AFTER DELETE ON provider_days BEGIN
    UPDATE provider_state SET
        revision = revision + 1, record_count = record_count - OLD.record_count, data_rows = data_rows - 1,
        payload_bytes = payload_bytes - OLD.payload_bytes,
        last_changed_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE source_id = OLD.source_id;
END;

CREATE TRIGGER day_state_update AFTER UPDATE ON provider_days
WHEN NEW.content_hash IS NOT OLD.content_hash BEGIN
    UPDATE provider_state SET
        revision = revision + 1, record_count = record_count + NEW.record_count - OLD.record_count,
        payload_bytes = payload_bytes + NEW.payload_bytes - OLD.payload_bytes, last_changed_at = NEW.updated_at
    WHERE source_id = NEW.source_id;
END;

-- One lease and last receipt per provider, not an append-only row per point/batch.
CREATE TABLE footprint_imports (
    source_id TEXT PRIMARY KEY REFERENCES sources(id),
    id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'cancelled')),
    file_name TEXT NOT NULL,
    total_days INTEGER NOT NULL,
    total_points INTEGER NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('web', 'cli')),
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    last_batch_id INTEGER NOT NULL DEFAULT 0,
    last_batch_hash TEXT,
    last_batch_result TEXT,
    last_utc_day INTEGER,
    committed_days INTEGER NOT NULL DEFAULT 0,
    committed_points INTEGER NOT NULL DEFAULT 0,
    inserted_days INTEGER NOT NULL DEFAULT 0,
    updated_days INTEGER NOT NULL DEFAULT 0,
    unchanged_days INTEGER NOT NULL DEFAULT 0
);

-- The second, disjoint event-window branch only searches actual intervals.
CREATE INDEX idx_life_events_interval
ON life_events(end_at, occurred_at, id)
WHERE precision != 'day' AND end_at > occurred_at;
