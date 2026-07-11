-- Integration connections table for storing per-customer OAuth tokens / API keys
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,         -- e.g. 'salesforce', 'hubspot', 'netsuite'
  display_name TEXT NOT NULL,     -- e.g. 'My Salesforce Prod'
  config TEXT NOT NULL,           -- JSON: { access_token, refresh_token, instance_url, scope, expires_at }
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'expired', 'error', 'pending'
  last_health_check_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
