import { withTenant } from "@/lib/db/with-tenant";

export interface PersonTotal {
  person: string;
  total: number;
}

/** Record that a person took money out of the business. */
export async function addWithdrawal(
  companyId: string,
  branchId: string,
  person: string,
  amount: number,
  note?: string,
): Promise<void> {
  await withTenant(companyId, async (tx) => {
    await tx.query(
      `INSERT INTO withdrawals (company_id, branch_id, person, amount, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [companyId, branchId, person.trim(), amount, note ?? null],
    );
  });
}

/**
 * This-month withdrawals grouped by person (+ grand total), for the month of the
 * latest withdrawal. Biggest-first.
 */
export async function listWithdrawals(
  companyId: string,
  branchId: string,
): Promise<{ monthLabel: string; items: PersonTotal[]; total: number }> {
  return withTenant(companyId, async (tx) => {
    const rows = (
      await tx.query<{ person: string; total: string }>(
        `SELECT person, SUM(amount)::text AS total
           FROM withdrawals
          WHERE branch_id = $1
            AND date_trunc('month', wdate) =
                (SELECT date_trunc('month', max(wdate)) FROM withdrawals WHERE branch_id = $1)
          GROUP BY person
          ORDER BY SUM(amount) DESC`,
        [branchId],
      )
    ).rows;
    const monthLabel = (
      await tx.query<{ ml: string }>(
        `SELECT to_char(max(wdate), 'YYYY-MM') AS ml FROM withdrawals WHERE branch_id = $1`,
        [branchId],
      )
    ).rows[0]?.ml ?? "";
    const items = rows.map((r) => ({ person: r.person, total: Number(r.total) }));
    const total = items.reduce((s, i) => s + i.total, 0);
    return { monthLabel, items, total };
  });
}

/** Total withdrawn this (latest) month — for the /report summary line. */
export async function monthlyWithdrawn(companyId: string, branchId: string): Promise<number> {
  return withTenant(companyId, async (tx) => {
    const res = await tx.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount),0)::text AS total
         FROM withdrawals
        WHERE branch_id = $1
          AND date_trunc('month', wdate) =
              (SELECT date_trunc('month', max(wdate)) FROM withdrawals WHERE branch_id = $1)`,
      [branchId],
    );
    return Number(res.rows[0]?.total ?? 0);
  });
}
