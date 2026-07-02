-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0005 — Panda (foodpanda / online) as a non-cash sale channel
-- cash sale = total − card − bkash − panda − due. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS sale_panda numeric(14,2) NOT NULL DEFAULT 0;
