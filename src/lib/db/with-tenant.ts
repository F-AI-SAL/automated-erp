import type { PoolClient } from "pg";
import { withTransaction } from "./client";

/**
 * Multi-tenant guard. Sets the Postgres session variable that RLS policies read:
 *
 *   USING (company_id = current_setting('app.current_company')::uuid)
 *
 * Every request-scoped DB access MUST go through here so a tenant can never
 * see another tenant's rows — isolation is enforced in the database, not app code.
 */
export async function withTenant<T>(
  companyId: string,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(async (tx) => {
    // set_config(key, value, is_local=true) → scoped to this transaction only.
    await tx.query("SELECT set_config('app.current_company', $1, true)", [
      companyId,
    ]);
    return fn(tx);
  });
}
