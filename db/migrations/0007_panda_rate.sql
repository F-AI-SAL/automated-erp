-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0007 — foodpanda commission rate per branch (default 32%)
-- Panda commission = panda sale × rate (a cost in the P&L). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE branches ADD COLUMN IF NOT EXISTS panda_rate numeric(5,4) NOT NULL DEFAULT 0.32;
