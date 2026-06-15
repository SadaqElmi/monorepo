-- Extended device inventory metadata for POS fleet management
ALTER TABLE pos_devices
  ADD COLUMN IF NOT EXISTS device_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS device_model VARCHAR(128),
  ADD COLUMN IF NOT EXISTS os_version VARCHAR(64),
  ADD COLUMN IF NOT EXISTS browser_version VARCHAR(64),
  ADD COLUMN IF NOT EXISTS last_ip INET,
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(32),
  ADD COLUMN IF NOT EXISTS hardware_profile JSONB,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS force_logout_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_outbox_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pos_devices_last_heartbeat_idx
  ON pos_devices (tenant_id, last_heartbeat_at DESC);
