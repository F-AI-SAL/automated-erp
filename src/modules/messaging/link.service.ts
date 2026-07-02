import { workerPool } from "@/lib/db/client";

/**
 * Telegram↔branch binding. These are cross-tenant lookups (we resolve the tenant
 * FROM the chat), so they use the BYPASSRLS worker connection — like login.
 */
export interface LinkedBranch {
  id: string;
  company_id: string;
  name: string;
}

/** Resolve which branch a Telegram chat is bound to (null if unlinked). */
export async function getBranchByTelegramChat(chatId: string): Promise<LinkedBranch | null> {
  const res = await workerPool.query<LinkedBranch>(
    `SELECT id, company_id, name FROM branches WHERE telegram_chat_id = $1 LIMIT 1`,
    [chatId],
  );
  return res.rows[0] ?? null;
}

export interface CompanyBranch {
  id: string;
  name: string;
  telegram_link_code: string;
  telegram_chat_id: string | null;
}

/** All branches of a company (for the /branch list). */
export async function listCompanyBranches(companyId: string): Promise<CompanyBranch[]> {
  const res = await workerPool.query<CompanyBranch>(
    `SELECT id, name, telegram_link_code, telegram_chat_id
       FROM branches WHERE company_id = $1 ORDER BY name`,
    [companyId],
  );
  return res.rows;
}

/** The link code for a branch (shown after creating it). */
export async function getLinkCode(branchId: string): Promise<string | null> {
  const res = await workerPool.query<{ telegram_link_code: string }>(
    `SELECT telegram_link_code FROM branches WHERE id = $1`,
    [branchId],
  );
  return res.rows[0]?.telegram_link_code ?? null;
}

/** Bind a chat to the branch that owns `code` (from `/link <code>`). */
export async function linkTelegramChat(
  code: string,
  chatId: string,
): Promise<LinkedBranch | null> {
  const res = await workerPool.query<LinkedBranch>(
    `UPDATE branches SET telegram_chat_id = $2
      WHERE telegram_link_code = $1
      RETURNING id, company_id, name`,
    [code.trim(), chatId],
  );
  return res.rows[0] ?? null;
}
