-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0008 — Owner / partner withdrawals (money taken out of the business)
-- Tracked per person (Faisal Dispatch, Protick, Faisal Fahim…). Not an expense —
-- it's a drawing against profit. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS withdrawals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  wdate       date NOT NULL DEFAULT current_date,
  person      text NOT NULL,
  amount      numeric(14,2) NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_scope ON withdrawals(company_id, branch_id, wdate);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS withdrawals_tenant ON withdrawals;
CREATE POLICY withdrawals_tenant ON withdrawals
  USING (company_id = current_setting('app.current_company', true)::uuid);
