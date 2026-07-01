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
  // (Kept as an upsert so any of the three events can trigger it safely.)
  await tx.query(
    `INSERT INTO profit_loss (company_id, branch_id, period, revenue, cogs, expenses, net_profit)
     SELECT
       $1, $2, current_date,
       COALESCE((SELECT SUM(total) FROM sales
                  WHERE branch_id = $2 AND sale_date = current_date), 0)          AS revenue,
       COALESCE((SELECT SUM(-change_qty * 0) FROM stock_movements
                  WHERE branch_id = $2 AND created_at::date = current_date), 0)    AS cogs,
       COALESCE((SELECT SUM(amount) FROM expenses
                  WHERE branch_id = $2 AND expense_date = current_date), 0)        AS expenses,
       0 AS net_profit
     ON CONFLICT (branch_id, period) DO UPDATE
       SET revenue     = EXCLUDED.revenue,
           cogs        = EXCLUDED.cogs,
           expenses    = EXCLUDED.expenses,
           net_profit  = EXCLUDED.revenue - EXCLUDED.cogs - EXCLUDED.expenses,
           updated_at  = now()`,
    [event.companyId, branchId],
  );
  // NOTE: COGS via recipe cost × qty is wired in Phase 2 (recipe costing).
}
