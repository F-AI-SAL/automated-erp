-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0006 — Monthly fixed costs (rent, salary, house rent)
-- Tracked per branch, separate from daily variable expenses. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fixed_costs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id      uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name           text NOT NULL,
  monthly_amount numeric(14,2) NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- one row per (branch, name) — case-insensitive — so "add" upserts the amount.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_costs_name
  ON fixed_costs(branch_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_fixed_costs_scope ON fixed_costs(company_id, branch_id);

ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fixed_costs_tenant ON fixed_costs;
CREATE POLICY fixed_costs_tenant ON fixed_costs
  USING (company_id = current_setting('app.current_company', true)::uuid);
