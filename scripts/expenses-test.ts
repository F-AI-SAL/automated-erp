import { pool, workerPool } from "@/lib/db/client";
import { register } from "@/modules/core/auth.service";
import { createBranch } from "@/modules/core/company.service";
import { recordDailyClosing } from "@/modules/finance/daily-closing.service";
import { getExpenseBreakdown } from "@/modules/finance/report.service";

/** Expense breakdown test: aggregates by category across days, biggest-first. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const reg = await register({
    companyName: "Exp Demo",
    ownerEmail: `exp-${Date.now().toString(36)}@fe.test`,
    ownerPassword: "demo-password",
  });
  const branch = await createBranch(reg.companyId, { name: "Main" }, reg.userId);
  const c = reg.companyId, b = branch.id;

  const zero = { saleTotal: 0, saleCard: 0, saleBkash: 0, salePanda: 0, saleDue: 0, openingCash: 0, addedCash: 0, cashInHand: 0 };
  // day 1
  await recordDailyClosing({ companyId: c, branchId: b, source: "manual", sourceHash: "e1",
    data: { ...zero, date: "2026-07-01", expenses: [{ name: "Vegetable", amount: 680 }, { name: "Gas", amount: 1500 }] } });
  // day 2 — same categories (case-insensitive) accumulate
  await recordDailyClosing({ companyId: c, branchId: b, source: "manual", sourceHash: "e2",
    data: { ...zero, date: "2026-07-02", expenses: [{ name: "vegetable", amount: 320 }, { name: "Chicken", amount: 3000 }] } });

  const { items, total } = await getExpenseBreakdown(c, b);
  assert(total === 5500, `total 5500, got ${total}`);
  // biggest-first: chicken 3000, gas 1500, vegetable 1000
  assert(items[0]!.name === "Chicken" && items[0]!.total === 3000, `top Chicken 3000, got ${items[0]!.name} ${items[0]!.total}`);
  const veg = items.find((i) => i.name === "Vegetable");
  assert(veg?.total === 1000, `vegetable merged to 1000, got ${veg?.total}`);
  assert(items.length === 3, `3 categories, got ${items.length}`);

  console.log("✅ EXPENSES TEST PASSED — category breakdown (case-insensitive merge, sorted)");
}

main()
  .then(async () => { await pool.end(); await workerPool.end(); process.exit(0); })
  .catch(async (err) => { console.error("❌", err); await pool.end().catch(()=>{}); await workerPool.end().catch(()=>{}); process.exit(1); });
