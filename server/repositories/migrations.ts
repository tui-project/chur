export const migrations = [{
  id: 1,
  sql: `
    CREATE TABLE admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX sessions_expiry ON sessions(expires_at);
    CREATE TABLE auth_limits (
      bucket TEXT PRIMARY KEY,
      failures INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE credentials (
      name TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL CHECK (json_valid(payload)),
      dedupe_key TEXT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','needs_review')),
      retry_safe INTEGER NOT NULL CHECK (retry_safe IN (0,1)),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL CHECK (max_attempts > 0),
      available_at INTEGER NOT NULL,
      lease_owner TEXT,
      lease_until INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    ) STRICT;
    CREATE INDEX jobs_ready ON jobs(status, available_at, created_at);
  `,
}]
