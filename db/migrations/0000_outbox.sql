-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0000 — Event backbone (the outbox table)
-- The full business schema (companies, branches, sales, ...) lands in 0001 on Day 3.
-- This one ships first because every other table publishes through it.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS outbox (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL,
  branch_id    uuid,
  type         text        NOT NULL,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','done','failed')),
  retries      int         NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Dispatcher claims pending rows in creation order (see FOR UPDATE SKIP LOCKED).
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbox_company
  ON outbox (company_id, created_at);

-- Row-Level Security: outbox rows are tenant-scoped like everything else.
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY outbox_tenant_isolation ON outbox
  USING (company_id = current_setting('app.current_company', true)::uuid);

-- NOTE: the dispatcher connects with a role that BYPASSES RLS (or sets the
-- company context per row, as dispatcher.ts does) so it can drain all tenants.
