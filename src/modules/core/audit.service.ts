import type { Pool, PoolClient } from "pg";

/** Anything that can run a query — a pooled client (inside a txn) or the Pool itself. */
type QueryRunner = Pick<PoolClient, "query"> | Pick<Pool, "query">;

export interface AuditEntry {
  companyId: string;
  /** who did it — null for system/automation actions */
  userId?: string | null;
  /** e.g. "branch.created", "sale.posted", "auth.login" */
  action: string;
  /** the affected table/aggregate, e.g. "branch" */
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Append an audit record. Pass the SAME transaction as the mutation so the log
 * commits atomically with the change it describes (no orphaned or missing logs).
 * The `audit_logs` table is RLS-scoped, so within a tenant txn the company_id
 * WITH CHECK is satisfied automatically.
 */
export async function writeAudit(runner: QueryRunner, entry: AuditEntry): Promise<void> {
  await runner.query(
    `INSERT INTO audit_logs (company_id, user_id, action, entity, entity_id, before, after)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.companyId,
      entry.userId ?? null,
      entry.action,
      entry.entity,
      entry.entityId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  );
}
