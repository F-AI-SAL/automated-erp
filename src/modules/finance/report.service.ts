import { withTenant } from "@/lib/db/with-tenant";

interface DayRow {
  closing_date: string;
  sale_total: string;
  expenses_total: string;
  shortage: string;
  status: string;
}

export interface BranchReport {
  hasData: boolean;
  monthLabel: string; // e.g. "2026-07"
  latest: {
    date: string;
    sale: number;
    expenses: number;
    gross: number; // sale − daily expenses
    fixedPerDay: number;
    net: number; // gross − fixed/day (real daily profit)
    shortage: number; // + short, − surplus
    status: string;
  } | null;
  month: {
    sale: number;
    expenses: number;
    fixed: number;
    profit: number; // sale − expenses − fixed
    days: number;
    shortDays: number;
    surplusDays: number;
  };
  fixedMonthly: number;
}

/**
 * Daily + monthly report for a branch. Uses the LATEST closing per day (so a
 * corrected re-entry supersedes) for the month of the most recent closing.
 * Fixed costs are applied to PROFIT (not to the daily cash beshi/short).
 */
export async function getBranchReport(companyId: string, branchId: string): Promise<BranchReport> {
  return withTenant(companyId, async (tx) => {
    const rows = (
      await tx.query<DayRow>(
        `WITH latest AS (
           SELECT DISTINCT ON (closing_date)
                  closing_date, sale_total, expenses_total, shortage, status
             FROM daily_closings
            WHERE branch_id = $1
            ORDER BY closing_date, created_at DESC
         )
         SELECT closing_date::text AS closing_date, sale_total, expenses_total, shortage, status
           FROM latest
          WHERE date_trunc('month', closing_date) =
                (SELECT date_trunc('month', max(closing_date)) FROM latest)
          ORDER BY closing_date`,
        [branchId],
      )
    ).rows;

    const fixedMonthly = Number(
      (
        await tx.query<{ total: string }>(
          `SELECT COALESCE(SUM(monthly_amount),0)::text AS total
             FROM fixed_costs WHERE branch_id = $1 AND is_active = true`,
          [branchId],
        )
      ).rows[0]?.total ?? 0,
    );

    if (rows.length === 0) {
      return {
        hasData: false,
        monthLabel: "",
        latest: null,
        month: { sale: 0, expenses: 0, fixed: fixedMonthly, profit: 0, days: 0, shortDays: 0, surplusDays: 0 },
        fixedMonthly,
      };
    }

    const monthLabel = rows[0]!.closing_date.slice(0, 7);
    const fixedPerDay = Math.round((fixedMonthly / 30) * 100) / 100;

    let sale = 0;
    let expenses = 0;
    let shortDays = 0;
    let surplusDays = 0;
    for (const r of rows) {
      sale += Number(r.sale_total);
      expenses += Number(r.expenses_total);
      if (r.status === "short") shortDays++;
      else if (r.status === "surplus") surplusDays++;
    }

    const last = rows[rows.length - 1]!;
    const lSale = Number(last.sale_total);
    const lExp = Number(last.expenses_total);
    const gross = lSale - lExp;

    return {
      hasData: true,
      monthLabel,
      latest: {
        date: last.closing_date,
        sale: lSale,
        expenses: lExp,
        gross,
        fixedPerDay,
        net: Math.round((gross - fixedPerDay) * 100) / 100,
        shortage: Number(last.shortage),
        status: last.status,
      },
      month: {
        sale,
        expenses,
        fixed: fixedMonthly,
        profit: Math.round((sale - expenses - fixedMonthly) * 100) / 100,
        days: rows.length,
        shortDays,
        surplusDays,
      },
      fixedMonthly,
    };
  });
}
