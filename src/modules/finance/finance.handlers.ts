import type { PoolClient } from "pg";
import { on } from "@/lib/eventbus";
import type { DomainEvent } from "@/lib/eventbus/domain-event";

/**
 * Finance keeps the `profit_loss` rollup fresh. Instead of computing P&L live on
 * the dashboard (slow), we recompute the affected period whenever revenue or cost
 * events land. Dashboard tiles then just SELECT a pre-computed row (fast).
 */
export function registerFinanceHandlers(): void {
  on("sale.posted", recomputePnl);
  on("expense.recorded", recomputePnl);
  on("salary.paid", recomputePnl);
}

async function recomputePnl(event: DomainEvent, tx: PoolClient): Promise<void> {
  const branchId = event.branchId;
  if (!branchId) return;

  // Recompute today's rollup for this branch from source tables.
  // net_profit is computed in the wrapping subquery so it is correct on BOTH the
  // initial INSERT and the ON CONFLICT UPDATE (an earlier version hard-coded 0 on
  // insert, so the first sale of the day always showed profit 0).
  await tx.query(
    `INSERT INTO profit_loss (company_id, branch_id, period, revenue, cogs, expenses, net_profit)
     SELECT $1, $2, current_date, r.revenue, r.cogs, r.expenses,
            r.revenue - r.cogs - r.expenses
     FROM (
       SELECT
         COALESCE((SELECT SUM(total) FROM sales
                    WHERE branch_id = $2 AND sale_date = current_date), 0)   AS revenue,
         0::numeric                                                          AS cogs,
         COALESCE((SELECT SUM(amount) FROM expenses
                    WHERE branch_id = $2 AND expense_date = current_date), 0) AS expenses
     ) r
     ON CONFLICT (branch_id, period) DO UPDATE
       SET revenue     = EXCLUDED.revenue,
           cogs        = EXCLUDED.cogs,
           expenses    = EXCLUDED.expenses,
           net_profit  = EXCLUDED.net_profit,
           updated_at  = now()`,
    [event.companyId, branchId],
  );
  // NOTE: COGS via recipe cost × qty is wired in Phase 2 (recipe costing).
}
