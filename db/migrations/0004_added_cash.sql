-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0004 — "Add cash" in the reconciliation
-- Expected cash = opening + added_cash + cash_sale − expenses. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS added_cash numeric(14,2) NOT NULL DEFAULT 0;
