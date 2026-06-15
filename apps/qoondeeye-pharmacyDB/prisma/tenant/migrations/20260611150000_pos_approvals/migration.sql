-- Supervisor approval workflow
CREATE TABLE IF NOT EXISTS pos_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  action_type VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason_code VARCHAR(64),
  reason_note TEXT,
  payload JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pos_approval_requests_branch_status_idx
  ON pos_approval_requests (branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_approval_requests_requested_by_idx
  ON pos_approval_requests (requested_by, created_at DESC);
