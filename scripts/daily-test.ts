import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import {
  computeReconciliation,
  recordDailyClosing,
} from "@/modules/finance/daily-closing.service";

/**
 * Daily-closing integration test (real Postgres in CI). No OCR — feeds known
 * numbers and asserts the reconciliation math, persistence, and idempotency.
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  // ── pure reconciliation math ──
  const data = {
    date: "2026-07-02",
    saleTotal: 5000,
    saleCard: 1000,
    saleBkash: 500,
    saleDue: 500,
    openingCash: 1000,
    addedCash: 500,
    cashInHand: 3400,
    expenses: [
      { name: "Bazar", amount: 800 },
      { name: "Rent", amount: 200 },
    ],
  };
  const r = computeReconciliation(data);
  // expected = opening 1000 + added 500 + cashSale 3000 − expenses 1000 = 3500
  assert(r.saleCash === 3000, `saleCash should be 3000, got ${r.saleCash}`);
  assert(r.expensesTotal === 1000, `expensesTotal should be 1000, got ${r.expensesTotal}`);
  assert(r.expectedCash === 3500, `expectedCash should be 3500, got ${r.expectedCash}`);
  assert(r.shortage === 100, `shortage should be 100, got ${r.shortage}`);
  assert(r.status === "short", `status should be short, got ${r.status}`);

  // ── persistence + idempotency ──
  const reg = await register({
    companyName: "Closing Demo",
    ownerEmail: `close-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "demo-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Main" }, reg.userId);

  const rec = await recordDailyClosing({
    companyId: reg.companyId,
    branchId: branch.id,
    data,
    source: "telegram_ai",
    sourceHash: "daily-test-1",
  });
  assert(rec.id && !rec.duplicate, "closing recorded");
  assert(rec.shortage === 100, `stored shortage should be 100, got ${rec.shortage}`);

  // stored row + expense lines
  const stored = await workerPool.query<{ shortage: string; status: string; sale_cash: string }>(
    `SELECT shortage, status, sale_cash FROM daily_closings WHERE id = $1`,
    [rec.id],
  );
  assert(Number(stored.rows[0]?.shortage) === 100, "db shortage 100");
  assert(stored.rows[0]?.status === "short", "db status short");
  const exp = await workerPool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM closing_expenses WHERE closing_id = $1`,
    [rec.id],
  );
  assert(Number(exp.rows[0]?.n) === 2, "2 expense lines stored");

  // idempotency: same source_hash → no duplicate
  const dup = await recordDailyClosing({
    companyId: reg.companyId,
    branchId: branch.id,
    data,
    source: "telegram_ai",
    sourceHash: "daily-test-1",
  });
  assert(dup.duplicate && dup.id === null, "re-sent sheet is idempotent");

  console.log("✅ DAILY-CLOSING TEST PASSED — reconciliation + persistence + idempotency verified");
}

main()
  .then(async () => {
    await pool.end();
    await workerPool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌", err);
    await pool.end().catch(() => {});
    await workerPool.end().catch(() => {});
    process.exit(1);
  });
