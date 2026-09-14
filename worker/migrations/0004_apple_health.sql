-- The existing single-provider lease table now also coordinates Apple Health.
ALTER TABLE footprint_imports ADD COLUMN files_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE footprint_imports ADD COLUMN write_token TEXT;

CREATE TABLE health_series (
    utc_day INTEGER NOT NULL CHECK (utc_day % 86400000 = 0),
    dimension TEXT NOT NULL,
    part INTEGER NOT NULL CHECK (part >= 0),
    record_count INTEGER NOT NULL CHECK (record_count > 0),
    first_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    raw_bytes INTEGER NOT NULL,
    payload_bytes INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (utc_day, dimension, part)
);
CREATE INDEX idx_health_series_overlap ON health_series(last_at, first_at, utc_day)
WHERE last_at >= utc_day + 86400000;

-- The manifest switches only after every verified part exists. Original file
-- parts are immutable by content hash; changed paths release unreferenced parts.
CREATE TABLE health_files (
    path TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('route', 'ecg', 'cda', 'metadata')),
    first_at INTEGER,
    last_at INTEGER,
    record_count INTEGER NOT NULL,
    raw_bytes INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE health_file_parts (
    file_hash TEXT NOT NULL,
    part INTEGER NOT NULL CHECK (part >= 0),
    raw_bytes INTEGER NOT NULL,
    payload_bytes INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (file_hash, part)
);

-- Top-level health facts are counted once by provider_days. Series and original
-- attachments contribute storage rows and bytes, never duplicate fact counts.
CREATE TRIGGER health_series_insert AFTER INSERT ON health_series BEGIN
    UPDATE provider_state SET revision = revision + 1, data_rows = data_rows + 1,
        payload_bytes = payload_bytes + NEW.payload_bytes, last_changed_at = NEW.updated_at
    WHERE source_id = 'apple-health';
END;
CREATE TRIGGER health_series_delete AFTER DELETE ON health_series BEGIN
    UPDATE provider_state SET revision = revision + 1, data_rows = data_rows - 1,
        payload_bytes = payload_bytes - OLD.payload_bytes
    WHERE source_id = 'apple-health';
END;
CREATE TRIGGER health_file_part_insert AFTER INSERT ON health_file_parts BEGIN
    UPDATE provider_state SET revision = revision + 1, data_rows = data_rows + 1,
        payload_bytes = payload_bytes + NEW.payload_bytes
    WHERE source_id = 'apple-health';
END;
CREATE TRIGGER health_file_part_delete AFTER DELETE ON health_file_parts BEGIN
    UPDATE provider_state SET revision = revision + 1, data_rows = data_rows - 1,
        payload_bytes = payload_bytes - OLD.payload_bytes
    WHERE source_id = 'apple-health';
END;
CREATE TRIGGER health_file_insert AFTER INSERT ON health_files BEGIN
    UPDATE provider_state SET revision = revision + 1, data_rows = data_rows + 1,
        payload_bytes = payload_bytes + length(CAST(NEW.manifest_json AS BLOB)),
        last_changed_at = NEW.updated_at
    WHERE source_id = 'apple-health';
END;
CREATE TRIGGER health_file_update AFTER UPDATE ON health_files
WHEN NEW.content_hash IS NOT OLD.content_hash BEGIN
    UPDATE provider_state SET revision = revision + 1,
        payload_bytes = payload_bytes + length(CAST(NEW.manifest_json AS BLOB)) - length(CAST(OLD.manifest_json AS BLOB)),
        last_changed_at = NEW.updated_at
    WHERE source_id = 'apple-health';
END;
CREATE TRIGGER health_file_delete AFTER DELETE ON health_files BEGIN
    UPDATE provider_state SET revision = revision + 1, data_rows = data_rows - 1,
        payload_bytes = payload_bytes - length(CAST(OLD.manifest_json AS BLOB))
    WHERE source_id = 'apple-health';
END;
