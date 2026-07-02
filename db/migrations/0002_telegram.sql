-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0002 — Telegram channel binding
-- A branch links to a Telegram chat so sell-sheet photos post to the right branch.
-- Idempotent (safe re-run).
-- ════════════════════════════════════════════════════════════════════════════

-- Chat this branch receives sell-sheets from (bound via /link <code>).
ALTER TABLE branches ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- Short code the owner types once (`/link <code>`) to bind their chat.
-- Volatile default backfills each existing row with a distinct code.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS telegram_link_code text
  DEFAULT substr(md5(gen_random_uuid()::text), 1, 8);

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tg_chat
  ON branches(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tg_code
  ON branches(telegram_link_code);

-- Allow the telegram_ai sale source (same pipeline as whatsapp_ai).
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_source_check;
ALTER TABLE sales ADD CONSTRAINT sales_source_check
  CHECK (source IN ('manual','whatsapp_ai','telegram_ai'));
