-- POS security anomaly events
CREATE TABLE IF NOT EXISTS pos_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  device_id UUID,
  event_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'medium',
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pos_security_events_branch_created_idx
  ON pos_security_events (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_security_events_type_idx
  ON pos_security_events (event_type, created_at DESC);

-- JWT refresh token rotation
CREATE TABLE IF NOT EXISTS pos_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pos_refresh_tokens_user_idx
  ON pos_refresh_tokens (user_id, expires_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS pos_refresh_tokens_hash_unique
  ON pos_refresh_tokens (token_hash);
