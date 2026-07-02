import { withTenant } from "@/lib/db/with-tenant";
import { normalizeCategory } from "./categories";

interface DayRow {
  closing_date: string;
  sale_total: string;
  sale_panda: string;
  expenses_total: string;
  shortage: string;
  status: string;
}

export interface PLReport {
  hasData: boolean;
  monthLabel: string;
  pandaRate: number;
  fixedMonthly: number;
  establishmentPerDay: number;
  latest: {
    date: string;
    sale: number;
    pandaSale: number;
    pandaCommission: number;
    expenses: number;
    establishment: number;
    totalCost: number;
    profit: number; // sale − total cost (Excel Profit/Loss)
    cashShortage: number; // + short, − beshi (from the cash reconciliation)
    cashStatus: string;
  } | null;
  month: {
    sale: number;
    pandaCommission: number;
    expenses: number;
    establishment: number;
    totalCost: number;
    profit: number;
    days: number;
    shortDays: number;
    surplusDays: number;
  };
}

/**
 * Excel-exact Profit/Loss:
 *   panda commission = panda sale × branch rate (default 32%)
 *   total cost       = panda commission + expenses + establishment (fixed/day)
 *   profit/loss      = sale − total cost
 * Fixed cost is applied to PROFIT here — it never touches the daily cash beshi/short.
 * Uses the LATEST closing per day, for the month of the most recent closing.
 */
export async function getBranchPL(companyId: string, branchId: string): Promise<PLReport> {
  return withTenant(companyId, async (tx) => {
    const pandaRate = Number(
      (await tx.query<{ panda_rate: string }>(`SELECT panda_rate FROM branches WHERE id = $1`, [branchId]))
        .rows[0]?.panda_rate ?? 0.32,
    );
    const fixedMonthly = Number(
      (
        await tx.query<{ total: string }>(
          `SELECT COALESCE(SUM(monthly_amount),0)::text AS total
             FROM fixed_costs WHERE branch_id = $1 AND is_active = true`,
          [branchId],
        )
      ).rows[0]?.total ?? 0,
    );
    const establishmentPerDay = Math.round((fixedMonthly / 30) * 100) / 100;

    const rows = (
      await tx.query<DayRow>(
        `WITH latest AS (
           SELECT DISTINCT ON (closing_date)
                  closing_date, sale_total, sale_panda, expenses_total, shortage, status
             FROM daily_closings
            WHERE branch_id = $1
            ORDER BY closing_date, created_at DESC
         )
         SELECT closing_date::text AS closing_date, sale_total, sale_panda, expenses_total, shortage, status
           FROM latest
          WHERE date_trunc('month', closing_date) =
                (SELECT date_trunc('month', max(closing_date)) FROM latest)
          ORDER BY closing_date`,
        [branchId],
      )
    ).rows;

    if (rows.length === 0) {
      return {
        hasData: false, monthLabel: "", pandaRate, fixedMonthly, establishmentPerDay,
        latest: null,
        month: { sale: 0, pandaCommission: 0, expenses: 0, establishment: 0, totalCost: 0, profit: 0, days: 0, shortDays: 0, surplusDays: 0 },
      };
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const monthLabel = rows[0]!.closing_date.slice(0, 7);

    let sale = 0, pandaComm = 0, expenses = 0, shortDays = 0, surplusDays = 0;
    for (const r of rows) {
      sale += Number(r.sale_total);
      pandaComm += Number(r.sale_panda) * pandaRate;
      expenses += Number(r.expenses_total);
      if (r.status === "short") shortDays++;
      else if (r.status === "surplus") surplusDays++;
    }
    const days = rows.length;
    const monthEstablishment = r2(establishmentPerDay * days);
    const monthTotalCost = r2(pandaComm + expenses + monthEstablishment);

    const last = rows[rows.length - 1]!;
    const lSale = Number(last.sale_total);
    const lPandaSale = Number(last.sale_panda);
    const lPandaComm = r2(lPandaSale * pandaRate);
    const lExp = Number(last.expenses_total);
    const lTotalCost = r2(lPandaComm + lExp + establishmentPerDay);

    return {
      hasData: true, monthLabel, pandaRate, fixedMonthly, establishmentPerDay,
      latest: {
        date: last.closing_date,
        sale: lSale,
        pandaSale: lPandaSale,
        pandaCommission: lPandaComm,
        expenses: lExp,
        establishment: establishmentPerDay,
        totalCost: lTotalCost,
        profit: r2(lSale - lTotalCost),
        cashShortage: Number(last.shortage),
        cashStatus: last.status,
      },
      month: {
        sale: r2(sale),
        pandaCommission: r2(pandaComm),
        expenses: r2(expenses),
        establishment: monthEstablishment,
        totalCost: monthTotalCost,
        profit: r2(sale - monthTotalCost),
        days, shortDays, surplusDays,
      },
    };
  });
}

export interface ExpenseCategory {
  name: string;
  total: number;
}

/**
 * Month expense breakdown by category (the expense name IS the category, e.g.
 * "vegetable", "gas", "chicken"). Uses the latest closing per day so corrections
 * don't double-count. Sorted biggest-first.
 */
export async function getExpenseBreakdown(
  companyId: string,
  branchId: string,
): Promise<{ monthLabel: string; items: ExpenseCategory[]; total: number }> {
  return withTenant(companyId, async (tx) => {
    const rows = (
      await tx.query<{ name: string; total: string }>(
        `WITH latest AS (
           SELECT DISTINCT ON (closing_date) id, closing_date
             FROM daily_closings WHERE branch_id = $1
            ORDER BY closing_date, created_at DESC
         ),
         month AS (
           SELECT id, closing_date FROM latest
            WHERE date_trunc('month', closing_date) =
                  (SELECT date_trunc('month', max(closing_date)) FROM latest)
         )
         SELECT lower(trim(ce.description)) AS name, SUM(ce.amount)::text AS total
           FROM closing_expenses ce
           JOIN month m ON m.id = ce.closing_id
          GROUP BY lower(trim(ce.description))
          ORDER BY SUM(ce.amount) DESC`,
        [branchId],
      )
    ).rows;

    const monthRow = (
      await tx.query<{ ml: string }>(
        `SELECT to_char(max(closing_date), 'YYYY-MM') AS ml FROM daily_closings WHERE branch_id = $1`,
        [branchId],
      )
    ).rows[0];

    // Merge spelling variations into canonical categories (Water, Coffee, …).
    const merged = new Map<string, number>();
    for (const r of rows) {
      const cat = normalizeCategory(r.name);
      merged.set(cat, (merged.get(cat) ?? 0) + Number(r.total));
    }
    const items = [...merged.entries()]
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
    const total = items.reduce((s, i) => s + i.total, 0);
    return { monthLabel: monthRow?.ml ?? "", items, total };
  });
}
