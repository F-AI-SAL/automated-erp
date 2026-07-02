import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import {
  computeReconciliation,
  recordDailyClosing,
} from "@/modules/finance/daily-closing.service";

/**
 * Daily-closing integration test (real Postgres in CI). Uses a REAL day's sheet
 * (1-7-26) to lock the reconciliation formula: it must reproduce "167 taka beshi".
 */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  // Real sheet (1-7-26): expected surplus of exactly 167.
  const data = {
    date: "2026-07-01",
    saleTotal: 53923,
    saleCard: 11826,
    saleBkash: 6448,
    salePanda: 4159,
    saleDue: 672,
    openingCash: 20730,
    addedCash: 0,
    cashInHand: 22640,
    expenses: [{ name: "daily cost", amount: 29075 }],
  };
  const r = computeReconciliation(data);
  // cash sale = 53923 − 11826 − 6448 − 4159 − 672 = 30818
  // expected  = 20730 + 0 + 30818 − 29075 = 22473 ; short = 22473 − 22640 = −167 (surplus)
  assert(r.saleCash === 30818, `saleCash should be 30818, got ${r.saleCash}`);
  assert(r.expectedCash === 22473, `expectedCash should be 22473, got ${r.expectedCash}`);
  assert(r.shortage === -167, `shortage should be −167, got ${r.shortage}`);
  assert(r.status === "surplus", `status should be surplus, got ${r.status}`);

  // persistence + idempotency
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
  assert(rec.shortage === -167, `stored shortage should be −167, got ${rec.shortage}`);

  const stored = await workerPool.query<{ shortage: string; status: string; sale_panda: string }>(
    `SELECT shortage, status, sale_panda FROM daily_closings WHERE id = $1`,
    [rec.id],
  );
  assert(Number(stored.rows[0]?.shortage) === -167, "db shortage −167");
  assert(Number(stored.rows[0]?.sale_panda) === 4159, "db sale_panda 4159");

  const dup = await recordDailyClosing({
    companyId: reg.companyId,
    branchId: branch.id,
    data,
    source: "telegram_ai",
    sourceHash: "daily-test-1",
  });
  assert(dup.duplicate && dup.id === null, "re-sent sheet is idempotent");

  console.log("✅ DAILY-CLOSING TEST PASSED — real sheet reproduces 167 beshi (surplus) + persistence + idempotency");
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
