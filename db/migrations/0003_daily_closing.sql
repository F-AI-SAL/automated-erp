-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0003 — Daily cash-closing (the real workflow)
-- A daily reconciliation sheet: sales by mode, expenses, opening/closing cash,
-- and the shortage check. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_closings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id      uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  closing_date   date NOT NULL,
  -- sales split by payment mode
  sale_total     numeric(14,2) NOT NULL DEFAULT 0,
  sale_card      numeric(14,2) NOT NULL DEFAULT 0,
  sale_bkash     numeric(14,2) NOT NULL DEFAULT 0,
  sale_due       numeric(14,2) NOT NULL DEFAULT 0,
  sale_cash      numeric(14,2) NOT NULL DEFAULT 0,   -- derived: total − card − bkash − due
  -- cash movement
  opening_cash   numeric(14,2) NOT NULL DEFAULT 0,
  expenses_total numeric(14,2) NOT NULL DEFAULT 0,
  cash_in_hand   numeric(14,2) NOT NULL DEFAULT 0,   -- counted at day end
  expected_cash  numeric(14,2) NOT NULL DEFAULT 0,   -- opening + cash sale − cash expenses
  shortage       numeric(14,2) NOT NULL DEFAULT 0,   -- expected − actual (＋ = short, − = surplus)
  status         text NOT NULL DEFAULT 'matched',    -- short | matched | surplus
  source         text NOT NULL DEFAULT 'manual',
  source_hash    text NOT NULL,
  raw            jsonb,                               -- full OCR payload for audit/debug
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, source_hash)                     -- idempotency (re-sent photo)
);
CREATE INDEX IF NOT EXISTS idx_daily_closings_scope
  ON daily_closings(company_id, branch_id, closing_date);

CREATE TABLE IF NOT EXISTS closing_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id  uuid NOT NULL REFERENCES daily_closings(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount      numeric(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_closing_expenses_closing ON closing_expenses(closing_id);

-- RLS: daily_closings by company_id; closing_expenses via parent.
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_closings_tenant ON daily_closings;
CREATE POLICY daily_closings_tenant ON daily_closings
  USING (company_id = current_setting('app.current_company', true)::uuid);

ALTER TABLE closing_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS closing_expenses_tenant ON closing_expenses;
CREATE POLICY closing_expenses_tenant ON closing_expenses
  USING (EXISTS (SELECT 1 FROM daily_closings d
                  WHERE d.id = closing_expenses.closing_id
                    AND d.company_id = current_setting('app.current_company', true)::uuid));
