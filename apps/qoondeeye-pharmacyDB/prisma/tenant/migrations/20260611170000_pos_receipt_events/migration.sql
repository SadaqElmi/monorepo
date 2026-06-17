-- Receipt reprint / resend audit events
CREATE TABLE IF NOT EXISTS pos_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL,
  channel VARCHAR(32),
  recipient TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pos_receipt_events_sale_idx
  ON pos_receipt_events (sale_id, created_at DESC);
