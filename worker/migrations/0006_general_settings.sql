-- One owner, one compact document. Raw records and AI credentials remain in their own tables.
CREATE TABLE IF NOT EXISTS general_settings (
    id TEXT PRIMARY KEY CHECK (id = 'default'),
    data_json TEXT NOT NULL CHECK (json_valid(data_json)),
    updated_at INTEGER NOT NULL
);
