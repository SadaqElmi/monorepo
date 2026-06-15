-- Cash drawer movements per POS shift session
CREATE TABLE IF NOT EXISTS pos_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES pos_sessions(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  movement_type VARCHAR(32) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  reason_code VARCHAR(64),
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  client_ref UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_cash_movements_client_ref_unique
  ON pos_cash_movements (session_id, client_ref)
  WHERE client_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS pos_cash_movements_session_idx
  ON pos_cash_movements (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_cash_movements_branch_created_idx
  ON pos_cash_movements (branch_id, created_at DESC);
