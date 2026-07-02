import { withTenant } from "@/lib/db/with-tenant";

export interface DailyClosingInput {
  date: string; // YYYY-MM-DD
  saleTotal: number;
  saleCard: number;
  saleBkash: number;
  saleDue: number;
  openingCash: number;
  cashInHand: number;
  expenses: Array<{ name: string; amount: number }>;
}

export interface Reconciliation {
  saleCash: number;
  expensesTotal: number;
  expectedCash: number;
  shortage: number; // + = short (cash missing), − = surplus
  status: "short" | "matched" | "surplus";
}

/**
 * Pure reconciliation math (no I/O — unit-testable).
 *   cash sale     = total − card − bkash − due
 *   expected cash = opening + cash sale − expenses
 *   shortage      = expected − counted   (＋ short, − surplus)
 */
export function computeReconciliation(input: DailyClosingInput): Reconciliation {
  const saleCash = Math.max(0, input.saleTotal - input.saleCard - input.saleBkash - input.saleDue);
  const expensesTotal = input.expenses.reduce((s, e) => s + e.amount, 0);
  const expectedCash = input.openingCash + saleCash - expensesTotal;
  const shortage = Math.round((expectedCash - input.cashInHand) * 100) / 100;
  const status = shortage > 0 ? "short" : shortage < 0 ? "surplus" : "matched";
  return { saleCash, expensesTotal, expectedCash, shortage, status };
}

export interface RecordedClosing extends Reconciliation {
  id: string | null;
  duplicate: boolean;
}

/** Persist a daily closing + its expense lines (RLS-scoped, idempotent on source_hash). */
export async function recordDailyClosing(args: {
  companyId: string;
  branchId: string;
  data: DailyClosingInput;
  source: "manual" | "telegram_ai" | "whatsapp_ai";
  sourceHash: string;
  raw?: unknown;
}): Promise<RecordedClosing> {
  const r = computeReconciliation(args.data);
  const today = new Date().toISOString().slice(0, 10);
  const closingDate = args.data.date?.match(/^\d{4}-\d{2}-\d{2}$/) ? args.data.date : today;

  return withTenant(args.companyId, async (tx) => {
    const res = await tx.query<{ id: string }>(
      `INSERT INTO daily_closings
         (company_id, branch_id, closing_date, sale_total, sale_card, sale_bkash, sale_due,
          sale_cash, opening_cash, expenses_total, cash_in_hand, expected_cash, shortage,
          status, source, source_hash, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (branch_id, source_hash) DO NOTHING
       RETURNING id`,
      [
        args.companyId, args.branchId, closingDate,
        args.data.saleTotal, args.data.saleCard, args.data.saleBkash, args.data.saleDue,
        r.saleCash, args.data.openingCash, r.expensesTotal, args.data.cashInHand,
        r.expectedCash, r.shortage, r.status, args.source, args.sourceHash,
        args.raw === undefined ? null : JSON.stringify(args.raw),
      ],
    );

    if (res.rows.length === 0) return { ...r, id: null, duplicate: true };
    const id = res.rows[0]!.id;

    for (const e of args.data.expenses) {
      await tx.query(
        `INSERT INTO closing_expenses (closing_id, description, amount) VALUES ($1,$2,$3)`,
        [id, e.name, e.amount],
      );
    }
    return { ...r, id, duplicate: false };
  });
}
