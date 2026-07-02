import { withTenant } from "@/lib/db/with-tenant";

export interface FixedCost {
  id: string;
  name: string;
  monthly_amount: string;
}

/** Add or update a monthly fixed cost (upsert by branch + case-insensitive name). */
export async function addFixedCost(
  companyId: string,
  branchId: string,
  name: string,
  monthlyAmount: number,
): Promise<void> {
  await withTenant(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO fixed_costs (company_id, branch_id, name, monthly_amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (branch_id, lower(name))
       DO UPDATE SET monthly_amount = EXCLUDED.monthly_amount, is_active = true, updated_at = now()`,
      [companyId, branchId, name.trim(), monthlyAmount],
    );
  });
}

/** List active fixed costs + monthly total for a branch. */
export async function listFixedCosts(
  companyId: string,
  branchId: string,
): Promise<{ items: FixedCost[]; monthlyTotal: number }> {
  return withTenant(companyId, async (tx) => {
    const res = await tx.query<FixedCost>(
      `SELECT id, name, monthly_amount FROM fixed_costs
        WHERE branch_id = $1 AND is_active = true
        ORDER BY monthly_amount DESC`,
      [branchId],
    );
    const monthlyTotal = res.rows.reduce((s, r) => s + Number(r.monthly_amount), 0);
    return { items: res.rows, monthlyTotal };
  });
}

/** Remove (deactivate) a fixed cost by name. Returns true if one was removed. */
export async function removeFixedCost(
  companyId: string,
  branchId: string,
  name: string,
): Promise<boolean> {
  return withTenant(companyId, async (tx) => {
    const res = await tx.query(
      `DELETE FROM fixed_costs WHERE branch_id = $1 AND lower(name) = lower($2)`,
      [branchId, name.trim()],
    );
    return (res.rowCount ?? 0) > 0;
  });
}
